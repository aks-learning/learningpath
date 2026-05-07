---
sidebar_position: 3
title: "Platform extensions"
description: "Essential Kubernetes ecosystem tools for AKS: Dapr, cert-manager, external-dns, External Secrets Operator, Gateway API, and OpenTelemetry."
---

# Platform extensions

A production AKS cluster needs more than just Kubernetes. These are the ecosystem tools that fill the gaps between what Kubernetes provides and what production workloads actually need.

## cert-manager

Automated TLS certificate lifecycle management. It watches Ingress and Gateway resources, requests certificates from issuers like Let's Encrypt or Azure Key Vault, and renews them before expiry. Manual certificate management does not scale — one forgotten renewal takes down production at 2 AM.

### Install

```bash
helm repo add jetstack https://charts.jetstack.io --force-update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true
```

### Recommended configuration

Use a `ClusterIssuer` instead of namespace-scoped `Issuer` resources. One issuer serves every namespace.

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform-team@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

:::warning

Do not use the Let's Encrypt staging issuer in production "just to test." Staging certificates are not trusted by browsers and will cause silent failures in health checks and monitoring tools.

:::

### Common mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Namespace-scoped `Issuer` per team | Duplicated config, inconsistent renewal | Use `ClusterIssuer` |
| Missing RBAC for DNS-01 challenges | Certificate issuance fails silently | Grant the cert-manager identity `DNS Zone Contributor` on your Azure DNS zone |
| Not monitoring certificate expiry | Outages from expired certs | Add a Prometheus alert on `certmanager_certificate_expiration_timestamp_seconds` |

## external-dns

Automatically creates and updates DNS records in Azure DNS when you create Ingress or Service resources. If your process involves opening the Azure portal to add an A record, you have a gap in your GitOps pipeline.

### Install

```bash
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns
helm install external-dns external-dns/external-dns \
  --namespace external-dns --create-namespace \
  --set provider.name=azure \
  --set azure.resourceGroup=<YOUR_DNS_RG> \
  --set azure.subscriptionId=<YOUR_SUB_ID> \
  --set azure.tenantId=<YOUR_TENANT_ID> \
  --set policy=upsert-only \
  --set registry=txt --set txtOwnerId=aks-cluster-01
```

:::tip

Set `policy=upsert-only` in production. The default `sync` policy deletes DNS records that are no longer backed by a Kubernetes resource, which can wipe records managed outside the cluster.

:::

### Recommended configuration

Use workload identity for authentication:

```bash
az role assignment create \
  --assignee-object-id <EXTERNAL_DNS_MI_OBJECT_ID> \
  --role "DNS Zone Contributor" \
  --scope /subscriptions/<SUB_ID>/resourceGroups/<RG>/providers/Microsoft.Network/dnsZones/<ZONE>
```

### Common mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Using `sync` policy with shared DNS zones | Deletes records owned by other systems | Use `upsert-only` and set a unique `txtOwnerId` |
| Running multiple instances without owner IDs | Conflicting updates, record flapping | Every cluster gets its own `txtOwnerId` |
| Forgetting `--txt-prefix` | TXT ownership records collide with real TXT records | Set `--txt-prefix=extdns-` |

## External Secrets Operator

Syncs secrets from Azure Key Vault into Kubernetes `Secret` objects. Use ESO instead of the Azure Key Vault CSI driver for most workloads — ESO supports templating, automatic rotation, and works with any pod without requiring CSI volume mounts.

### Install

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace \
  --set installCRDs=true
```

### Recommended configuration

Create a `ClusterSecretStore` with workload identity:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: azure-keyvault
spec:
  provider:
    azurekv:
      authType: WorkloadIdentity
      vaultUrl: https://my-vault.vault.azure.net
      serviceAccountRef:
        name: external-secrets-sa
        namespace: external-secrets
```

Then declare secrets per namespace:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-keyvault
    kind: ClusterSecretStore
  target:
    name: app-secrets
  data:
    - secretKey: db-password
      remoteRef:
        key: my-app-db-password
```

:::info

The CSI Secrets Store driver mounts secrets as files and requires every pod to declare a volume. External Secrets Operator creates standard Kubernetes Secrets that work with `envFrom`, `env`, and volume mounts without any changes to your pod spec. Prefer ESO unless you specifically need file-based secret injection.

:::

### Common mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Setting `refreshInterval` to `0` | Secrets never rotate after initial sync | Use `1h` or shorter for sensitive credentials |
| One `SecretStore` per namespace | Duplicated Key Vault config across namespaces | Use `ClusterSecretStore` |
| Not setting `target.creationPolicy: Owner` | Orphaned Kubernetes Secrets after `ExternalSecret` deletion | Set `creationPolicy: Owner` to garbage-collect secrets |

## Dapr

Dapr provides building blocks for microservices: service invocation, pub/sub, state management, and bindings. If you are building services that publish events or manage state, Dapr abstracts the infrastructure so your code does not couple to a specific broker or store.

### Install

Use the AKS extension, not Helm. The AKS extension is managed by Microsoft, handles upgrades, and integrates with Azure support.

```bash
az k8s-extension create \
  --cluster-type managedClusters \
  --cluster-name <CLUSTER_NAME> \
  --resource-group <RG> \
  --name dapr \
  --extension-type Microsoft.Dapr \
  --auto-upgrade-minor-version true
```

:::warning

Do not install Dapr via Helm on AKS. The AKS extension provides lifecycle management, monitoring integration, and support coverage that a Helm install does not.

:::

### Recommended configuration

Enable Dapr by annotating the pod spec:

```yaml
annotations:
  dapr.io/enabled: "true"
  dapr.io/app-id: "order-service"
  dapr.io/app-port: "8080"
  dapr.io/log-level: "info"
```

### Common mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Installing Dapr via Helm on AKS | No support coverage, manual upgrades | Use the AKS extension |
| Enabling Dapr on every pod | Unnecessary sidecar overhead for simple services | Only annotate pods that use Dapr building blocks |
| Skipping mTLS configuration | Service-to-service traffic is unencrypted | Dapr enables mTLS by default; do not disable it |

## Gateway API

Gateway API is the successor to the Ingress resource. It provides a standard, role-oriented API for L4/L7 traffic routing with support for traffic splitting, header-based routing, and cross-namespace references. Use it instead of Ingress for new workloads.

### Install

On AKS, use Application Gateway for Containers (AGC) as the Gateway API implementation:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml
```

### Recommended configuration

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: main-gateway
  namespace: gateway-infra
spec:
  gatewayClassName: azure-alb-external
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        certificateRefs:
          - name: wildcard-cert
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-route
spec:
  parentRefs:
    - name: main-gateway
      namespace: gateway-infra
  hostnames: ["app.example.com"]
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - name: app-service
          port: 80
```

:::tip

Define the `Gateway` resource in an infrastructure namespace owned by the platform team. Application teams create `HTTPRoute` resources in their own namespaces with `parentRefs` pointing to the shared gateway. This enforces separation of concerns.

:::

### Common mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Using Ingress when Gateway API is available | Locked into annotation-based config, limited routing | Migrate to Gateway API for new workloads |
| One Gateway per application | Wasted load balancer resources, higher cost | Share a Gateway across applications using HTTPRoute |
| Missing `ReferenceGrant` for cross-namespace refs | Routes silently fail to attach | Create `ReferenceGrant` in the target namespace |

## OpenTelemetry Collector

A vendor-neutral telemetry pipeline that receives, processes, and exports traces, metrics, and logs. Instrument once with OpenTelemetry SDKs, then route to Azure Monitor, Prometheus, or any OTLP-compatible backend without changing application code.

### Install

```bash
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm install otel-collector open-telemetry/opentelemetry-collector \
  --namespace otel --create-namespace \
  --set mode=deployment
```

### Recommended configuration

Use the DaemonSet mode for log and metric collection, Deployment mode for trace aggregation:

```yaml
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: otel
  namespace: otel
spec:
  mode: daemonset
  config:
    receivers:
      otlp:
        protocols:
          grpc: { endpoint: 0.0.0.0:4317 }
          http: { endpoint: 0.0.0.0:4318 }
    processors:
      batch:
        timeout: 5s
        send_batch_size: 1024
      memory_limiter:
        check_interval: 1s
        limit_mib: 512
    exporters:
      otlp:
        endpoint: "azure-monitor-endpoint:443"
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [memory_limiter, batch]
          exporters: [otlp]
        metrics:
          receivers: [otlp]
          processors: [memory_limiter, batch]
          exporters: [otlp]
```

:::warning

Always configure the `memory_limiter` processor. Without it, a burst of telemetry data can OOM-kill the collector pod and create a gap in your observability pipeline.

:::

### Common mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Skipping the `memory_limiter` processor | Collector OOM under load | Add `memory_limiter` as the first processor in every pipeline |
| Running only Deployment mode | Misses node-level metrics and logs | Use DaemonSet for collection, Deployment for aggregation |
| Exporting everything without sampling | High cost, storage bloat | Configure tail sampling for traces at 10-20% in non-production |

## Kyverno

A policy engine for Kubernetes that uses YAML instead of Rego (OPA Gatekeeper). Kyverno validates, mutates, generates, and cleans up resources. Use Kyverno instead of OPA Gatekeeper unless your organization already has a Rego investment.

### Install

```bash
helm repo add kyverno https://kyverno.github.io/kyverno
helm install kyverno kyverno/kyverno \
  --namespace kyverno --create-namespace \
  --set replicaCount=3
```

### Recommended configuration

Start with `Audit` mode, then switch to `Enforce` once you confirm policies do not break existing workloads:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resource-limits
spec:
  validationFailureAction: Audit
  rules:
    - name: check-limits
      match:
        any:
          - resources:
              kinds: [Pod]
      validate:
        message: "CPU and memory limits are required."
        pattern:
          spec:
            containers:
              - resources:
                  limits:
                    memory: "?*"
                    cpu: "?*"
```

:::info

Use Kyverno instead of OPA Gatekeeper unless your organization already has a Rego investment. Kyverno policies are easier to write, review in PRs, and debug. The mutation and generation capabilities also reduce boilerplate across namespaces.

:::

### Common mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Starting with `Enforce` mode | Blocks existing workloads that violate policies | Start with `Audit`, review violations, then switch to `Enforce` |
| Not excluding system namespaces | Policies block kube-system components | Add `exclude` rules for `kube-system`, `cert-manager`, and other platform namespaces |
| Too many mutation policies | Hard to debug why a resource looks different from the manifest | Document mutations and keep them minimal |

## Which extensions do you need?

Not every cluster needs every extension. Use this table to pick the right set for your workload type.

| Extension | Web app | Microservices | Event-driven | ML/batch |
|---|---|---|---|---|
| cert-manager | Required | Required | Recommended | Optional |
| external-dns | Required | Required | Recommended | Optional |
| External Secrets Operator | Required | Required | Required | Required |
| Dapr | Optional | Required | Required | Not needed |
| Gateway API | Required | Required | Optional | Not needed |
| OpenTelemetry Collector | Required | Required | Required | Recommended |
| Kyverno | Required | Required | Required | Required |

## Anti-patterns

**Installing everything on day one.** Start with what you need. Each extension adds CRDs, pods, and upgrade burden. Add extensions when you have a concrete use case.

**Using Helm when an AKS add-on exists.** AKS provides managed versions of Dapr, KEDA, Flux, and others. These integrate with Azure support and upgrade automatically. Check before reaching for Helm:

```bash
az k8s-extension list --cluster-type managedClusters \
  --cluster-name <CLUSTER_NAME> --resource-group <RG> -o table
```

**Running extensions without resource limits.** Every extension runs pods in your cluster. Set requests and limits on all extension workloads to prevent resource starvation.

**Over-scoping RBAC.** Use workload identity with the narrowest role possible. Do not assign `Contributor` at the subscription level when `DNS Zone Contributor` on a single zone is sufficient.

## Resources

- [AKS extensions overview](https://learn.microsoft.com/azure/aks/cluster-extensions)
- [cert-manager on AKS](https://learn.microsoft.com/azure/aks/certificate-management)
- [External DNS with Azure DNS](https://learn.microsoft.com/azure/aks/workload-identity-deploy-cluster#configure-external-dns)
- [External Secrets Operator with Key Vault](https://external-secrets.io/latest/provider/azure-key-vault/)
- [Dapr AKS extension](https://learn.microsoft.com/azure/aks/dapr)
- [Gateway API on AKS with AGC](https://learn.microsoft.com/azure/application-gateway/for-containers/overview)
- [OpenTelemetry with Azure Monitor](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable)
- [Kyverno documentation](https://kyverno.io/docs/)
- [AKS workload identity](https://learn.microsoft.com/azure/aks/workload-identity-overview)
