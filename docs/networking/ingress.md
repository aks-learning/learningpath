---
sidebar_position: 3
title: "Ingress and Load Balancing"
description: "Use App Routing for standard workloads. Use AGC for enterprise WAF. Do not self-manage NGINX unless you have exotic requirements."
---

# Ingress and load balancing

You have three real options for L7 ingress on AKS: the App Routing add-on (managed NGINX), Application Gateway for Containers (AGC), or self-managed NGINX. Pick one and commit.

## The decision

| Requirement | Use This |
|-------------|----------|
| Standard web apps, APIs, TLS termination | **App Routing add-on** |
| Enterprise: WAF, advanced traffic splitting, Gateway API | **Application Gateway for Containers (AGC)** |
| Exotic NGINX config, custom Lua plugins, full control | **Self-managed NGINX** |
| Raw TCP/UDP without HTTP routing | **LoadBalancer Service** (skip ingress entirely) |

:::tip

Use App Routing for standard workloads. Use AGC for enterprise with WAF needs. Do not self-manage NGINX unless you need exotic configuration that the managed add-on cannot provide.
:::

## App routing add-on (managed NGINX)

This is the default choice. Microsoft manages the NGINX ingress controller lifecycle, upgrades, and scaling. You write Ingress resources, it handles the rest.

```bash
# Enable App Routing on an existing cluster
az aks approuting enable --resource-group myrg --name myaks

# With Azure DNS integration and Key Vault for certs
az aks approuting enable \
  --resource-group myrg \
  --name myaks \
  --enable-kv \
  --attach-kv /subscriptions/.../vaults/my-kv
```

```yaml
# Standard Ingress with App Routing
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: webapprouting.kubernetes.azure.com
  tls:
    - hosts:
        - myapp.example.com
      secretName: myapp-tls
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-app-svc
                port:
                  number: 80
```

App Routing gives you:
- Managed NGINX lifecycle (no Helm chart babysitting)
- Native Azure DNS zone integration
- Key Vault integration for TLS certificates
- Multiple ingress controller instances (internal + external)
- Prometheus metrics out of the box

## Application Gateway for containers (AGC)

AGC is the successor to AGIC (Application Gateway Ingress Controller). It is Kubernetes Gateway API-native, not legacy Ingress. Use it when you need WAF, advanced traffic management, or Azure-native L7 load balancing at scale.

```yaml
# Gateway API: Gateway resource (AGC-backed)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  annotations:
    alb.networking.azure.io/alb-id: /subscriptions/.../applicationGateways/my-agc
spec:
  gatewayClassName: azure-alb-external
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: my-cert
---
# HTTPRoute for traffic routing
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-app-route
spec:
  parentRefs:
    - name: my-gateway
  hostnames:
    - "myapp.example.com"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-service
          port: 8080
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: frontend-service
          port: 3000
```

:::info

AGC uses the Kubernetes Gateway API (Gateway, HTTPRoute, GRPCRoute), not the legacy Ingress resource. This is the future direction of Kubernetes traffic management. If you are starting fresh, prefer Gateway API.
:::

## Internal vs external load balancers

For L4 (TCP/UDP) services or internal-only exposure:

```yaml
# Internal Load Balancer -- not internet-facing
apiVersion: v1
kind: Service
metadata:
  name: internal-api
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-internal: "true"
    service.beta.kubernetes.io/azure-load-balancer-internal-subnet: "internal-subnet"
spec:
  type: LoadBalancer
  ports:
    - port: 443
      targetPort: 8443
  selector:
    app: internal-api
---
# External Load Balancer with static IP
apiVersion: v1
kind: Service
metadata:
  name: public-api
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-resource-group: "pip-rg"
spec:
  type: LoadBalancer
  loadBalancerIP: 20.1.2.3  # Pre-created Public IP
  ports:
    - port: 443
      targetPort: 8443
  selector:
    app: public-api
```

## TLS and certificate management

Use cert-manager with Let's Encrypt for automated certificate lifecycle. Do not manually manage certificates.

```yaml
# ClusterIssuer for Let's Encrypt
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
            ingressClassName: webapprouting.kubernetes.azure.com
```

For Azure Key Vault-managed certificates (enterprise):

```bash
# App Routing pulls certs from Key Vault automatically
az aks approuting update \
  --resource-group myrg \
  --name myaks \
  --enable-kv \
  --attach-kv /subscriptions/.../vaults/prod-kv
```

## Common mistakes

1. **Self-managing NGINX "for control"** -- You inherit upgrade burden, CVE patching, and HPA tuning. App Routing handles all of this.
2. **Using AGIC (v1) for new projects** -- AGIC is legacy. AGC with Gateway API is the replacement.
3. **Forgetting internal ingress** -- Most apps need both external (public) and internal (private) ingress controllers. App Routing supports multiple instances.
4. **Hardcoding LoadBalancer IPs** -- Use external-dns with Azure DNS zones for automatic DNS record management.
5. **Not rate-limiting ingress** -- A single bad client can saturate your ingress controller. Configure rate limiting annotations.

:::warning

Never expose Services as `type: LoadBalancer` with a public IP without a WAF or DDoS protection plan. Use AGC with WAF policies for internet-facing workloads that handle user input.
:::

## Resources

- [App Routing Add-on](https://learn.microsoft.com/en-us/azure/aks/app-routing)
- [Application Gateway for Containers](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview)
- [Gateway API on AKS](https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api)
- [Internal Load Balancer](https://learn.microsoft.com/en-us/azure/aks/internal-lb)
- [cert-manager on AKS](https://learn.microsoft.com/en-us/azure/aks/app-routing)
- [AKS Labs](https://azure-samples.github.io/aks-labs)

---

**Next**: [Private Clusters](./private-clusters) -- lock down your API server.
