---
sidebar_position: 6
title: "Ingress comparison"
description: "Head-to-head comparison of NGINX (App Routing), Application Gateway for Containers, self-managed NGINX, and Gateway API for AKS ingress."
---

# Ingress comparison

Four ingress options exist on AKS. This page compares them side by side so you can pick one and move on.

## Full comparison

| Feature | App Routing (managed NGINX) | AGC (Application Gateway for Containers) | Self-managed NGINX | Gateway API (preview) |
|---------|----------------------------|------------------------------------------|--------------------|-----------------------|
| **Managed by** | Microsoft | Microsoft | You | You (with ALB controller) |
| **API model** | Ingress resource | Gateway API (Gateway, HTTPRoute) | Ingress resource | Gateway API |
| **TLS termination** | Yes (Key Vault, cert-manager) | Yes (Key Vault, managed certs) | Yes (manual or cert-manager) | Yes |
| **WAF** | No | Yes (Azure WAF v2) | ModSecurity (self-managed) | No |
| **mTLS** | Annotations (partial) | Native | Full control | Native |
| **Gateway API support** | No | Yes (native) | Community contrib | Yes (by definition) |
| **Traffic splitting** | Annotations (canary) | HTTPRoute weights | Annotations (canary) | HTTPRoute weights |
| **Custom config** | Limited annotations | Azure policies | Unlimited (nginx.conf) | CRD-based |
| **Scale to zero** | No | No | No | No |
| **Internal + external** | Yes (multiple instances) | Yes (separate Gateways) | Yes (separate deployments) | Yes |
| **Upgrades** | Automatic | Automatic | Manual Helm upgrades | Manual |
| **Cost** | Free (compute on your nodes) | Pay-per-use (Azure resource) | Free (compute on your nodes) | Free (compute on your nodes) |
| **Complexity** | Low | Medium | High | Medium |
| **Production readiness** | GA | GA | Depends on you | Preview |

## Decision tree

Start here and follow the path:

```
Do you need a WAF in front of your cluster?
├── Yes → Use AGC (Application Gateway for Containers)
│         It is the only option with Azure WAF v2 integrated.
│
└── No → Do you need Gateway API, advanced traffic policies, or header-based routing?
          ├── Yes → Do you need it in production today?
          │         ├── Yes → Use AGC (GA with Gateway API)
          │         └── No  → Evaluate Gateway API (preview) for future-proofing
          │
          └── No → Do you need custom NGINX modules, Lua plugins, or exotic config?
                    ├── Yes → Self-managed NGINX (accept the ops burden)
                    └── No  → Use App Routing (managed NGINX)
```

:::tip

Default to App Routing. It covers 80% of workloads with zero operational overhead. Upgrade to AGC when the business demands WAF or you need Gateway API in production.

:::

## When to use each

### App Routing: the default

Use App Routing when you need standard L7 ingress with TLS termination, path-based routing, and host-based routing. This covers most web apps and APIs.

```bash
# Enable App Routing with Key Vault integration
az aks approuting enable \
  --resource-group myrg \
  --name myaks \
  --enable-kv \
  --attach-kv /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.KeyVault/vaults/<vault>
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-api
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  ingressClassName: webapprouting.kubernetes.azure.com
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-svc
                port:
                  number: 80
```

### AGC: enterprise and WAF

Use AGC when you need WAF protection, Gateway API, weighted traffic splitting, or Azure-native L7 load balancing that lives outside your cluster.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: prod-gateway
  annotations:
    alb.networking.azure.io/alb-id: /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ServiceNetworking/trafficControllers/<name>
spec:
  gatewayClassName: azure-alb-external
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: prod-cert
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: canary-route
spec:
  parentRefs:
    - name: prod-gateway
  hostnames:
    - "app.example.com"
  rules:
    - backendRefs:
        - name: app-stable
          port: 80
          weight: 90
        - name: app-canary
          port: 80
          weight: 10
```

### Self-managed NGINX: only when you must

Use self-managed NGINX only when you need features that App Routing does not expose: custom Lua scripts, OpenResty modules, or a specific NGINX version pinned for compliance.

```bash
# Install via Helm -- you own upgrades, CVE patches, and HPA tuning
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.replicaCount=3 \
  --set controller.nodeSelector."kubernetes\.io/os"=linux \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"="/healthz"
```

:::warning

Self-managing NGINX means you are responsible for patching CVEs, scaling the controller, handling upgrades, and debugging failures. Most teams underestimate this burden. Use App Routing unless you have a specific, documented reason not to.

:::

### Gateway API: the future (preview)

Gateway API is the Kubernetes-native successor to the Ingress resource. It separates infrastructure concerns (Gateway) from application routing (HTTPRoute), giving platform teams and app teams distinct responsibilities. On AKS, AGC already supports Gateway API natively. The standalone Gateway API controller is in preview.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: cluster-gateway
spec:
  gatewayClassName: azure-alb-external
  listeners:
    - name: http
      protocol: HTTP
      port: 80
```

## Migration paths

| From | To | Path |
|------|----|------|
| AGIC (v1) | AGC | Deploy AGC alongside AGIC, migrate HTTPRoutes, remove AGIC. Microsoft recommends this migration. |
| Self-managed NGINX | App Routing | Enable App Routing, update `ingressClassName`, validate routing, remove Helm release. |
| App Routing | AGC | Deploy AGC, convert Ingress resources to Gateway + HTTPRoute, shift DNS, disable App Routing. |
| Any | Gateway API | Deploy Gateway API controller, create Gateway + HTTPRoute resources, shift traffic, remove old controller. |

:::info

AGIC (Application Gateway Ingress Controller v1) is legacy. If you are still running AGIC, migrate to AGC. Microsoft has stated that AGC is the replacement and the investment direction.

:::

## Anti-patterns

**Running two ingress controllers on the same cluster without isolation.** If both App Routing and self-managed NGINX watch the same Ingress resources, they fight over configuration. Use distinct `ingressClassName` values and make sure every Ingress explicitly declares which controller owns it.

**Mixing AGIC with NGINX.** AGIC writes rules to Application Gateway. NGINX runs inside the cluster. Having both means two separate traffic paths, two sets of TLS certs, two monitoring configurations, and twice the debugging surface. Pick one.

**Using LoadBalancer Services for HTTP traffic.** Every `type: LoadBalancer` Service creates an Azure Load Balancer rule. Ten services means ten public IPs and ten load balancer rules. Use an ingress controller to consolidate HTTP traffic behind a single IP.

**Skipping WAF for internet-facing workloads.** If your app accepts user input from the public internet, you need a WAF. App Routing and self-managed NGINX do not include one. Use AGC with Azure WAF or put Azure Front Door with WAF in front.

**Not setting rate limits.** A single aggressive client can saturate your ingress controller and affect all tenants behind it. Always configure rate limiting, either via NGINX annotations or AGC policies.

## Resources

- [App Routing add-on](https://learn.microsoft.com/en-us/azure/aks/app-routing)
- [Application Gateway for Containers overview](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview)
- [Migrate from AGIC to AGC](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc)
- [Gateway API on AKS](https://learn.microsoft.com/en-us/azure/aks/gateway-api)
- [NGINX Ingress annotations](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/)
- [Azure WAF on AGC](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/waf-overview)

---

**Next**: [Service Mesh](./service-mesh) -- when ingress is not enough and you need mesh-level observability and mTLS.
