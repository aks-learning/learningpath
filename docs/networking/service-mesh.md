---
sidebar_position: 5
title: "Service Mesh: Do You Need One?"
description: "You probably do not need a service mesh. Start without one. Here is how to decide, and what to use if you genuinely need it."
---

# Service Mesh: Do You Need One?

You probably do not need a service mesh. Start without one.

Service meshes add operational complexity, increase resource consumption (sidecar proxies on every pod), and solve problems most teams do not actually have. Before reaching for Istio, ask yourself: can network policies + ingress routing solve this?

## The Decision Framework

| You need... | Without mesh | With mesh |
|-------------|-------------|-----------|
| Pod-to-pod encryption (mTLS) | Network policies + pod identity | Automatic mTLS everywhere |
| Traffic splitting (canary) | Ingress-level canary (Flagger, AGC) | L7 traffic splitting per-service |
| Retry/timeout policies | Application-level (SDK) | Sidecar-level (transparent) |
| Circuit breaking | Application-level | Sidecar-level |
| Distributed tracing | OpenTelemetry SDK in your app | Automatic span generation |
| Cross-cluster communication | Manual setup | Built-in multi-cluster |
| L7 observability (HTTP metrics) | Application instrumentation | Automatic from sidecars |

:::tip

Network policies (Cilium) + application-level retries + OpenTelemetry cover 80% of what teams think they need a mesh for. Only add a mesh when you genuinely need transparent mTLS between all services or advanced L7 traffic management that you cannot do at the ingress layer.
:::

## When You DO Need a Service Mesh

**Zero-trust networking requirements**: Compliance mandates that every service-to-service call is encrypted and mutually authenticated. Network policies control who can connect (L3/L4), but a mesh adds L7 identity and encryption.

**Canary deployments at the service level**: You need to send 5% of traffic to v2 of an internal service (not just at the ingress boundary). This is true L7 traffic splitting.

**Cross-cluster service communication**: Services in Cluster A need to seamlessly call services in Cluster B with load balancing, retries, and mTLS.

**Regulatory audit trail**: You need per-request access logs between services for compliance, without modifying application code.

## When You DO NOT Need a Service Mesh

- You have fewer than 20 services -- the overhead is not worth it
- Your services already handle retries and timeouts (most modern frameworks do)
- You only need encryption in transit -- consider pod-level TLS instead
- You only need traffic splitting at the edge -- use AGC or App Routing
- You want "observability" -- use OpenTelemetry, not a mesh

## The Istio-Based Service Mesh Add-on

If you do need a mesh, use the AKS-managed Istio add-on. Do not self-manage Istio -- it is operationally expensive.

```bash
# Enable the managed Istio add-on
az aks mesh enable \
  --resource-group prod-rg \
  --name prod-cluster

# Verify the mesh is running
az aks show \
  --resource-group prod-rg \
  --name prod-cluster \
  --query "serviceMeshProfile"
```

Enable sidecar injection per namespace:

```bash
# Label namespace for automatic sidecar injection
kubectl label namespace my-app istio.io/rev=asm-1-22
```

```yaml
# Traffic splitting: 90% to v1, 10% to v2
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: my-service
spec:
  hosts:
    - my-service
  http:
    - route:
        - destination:
            host: my-service
            subset: v1
          weight: 90
        - destination:
            host: my-service
            subset: v2
          weight: 10
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: my-service
spec:
  host: my-service
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

What the managed add-on gives you:
- Microsoft manages Istio control plane upgrades
- Integrated with Azure Monitor for metrics
- Revision-based canary upgrades of the mesh itself
- No Helm chart management, no manual CRD upgrades

## Alternatives to a Full Mesh

### Cilium Service Mesh (Lighter)

If you already run Cilium (which you should -- see [CNI Comparison](./cni-comparison)), you get basic mesh capabilities without sidecars:

- **mTLS** via Cilium's identity-based encryption (WireGuard or IPsec at the node level)
- **L7 policies** via Cilium Envoy integration (no sidecar per pod)
- **Hubble** for L7 observability

This is not a full service mesh but covers the encryption and observability gap for many teams without the sidecar tax.

```yaml
# Cilium Network Policy with L7 rules (no mesh needed)
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: api-allow-get
spec:
  endpointSelector:
    matchLabels:
      app: api
  ingress:
    - fromEndpoints:
        - matchLabels:
            app: frontend
      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP
          rules:
            http:
              - method: GET
                path: "/api/v1/.*"
```

### Linkerd (Not AKS-Managed)

Linkerd is lighter than Istio but is not offered as an AKS-managed add-on. You own the lifecycle. Use it only if you have strong Linkerd expertise and need its Rust-based proxy (lower resource footprint than Envoy).

:::warning

If you choose a non-managed mesh (Linkerd, self-hosted Istio, Consul Connect), Microsoft support cannot help you debug mesh-related networking issues. You own it entirely.
:::

## Resource Impact

A service mesh is not free. Budget for:

| Component | Resource Cost |
|-----------|--------------|
| Istio control plane (istiod) | ~500m CPU, ~1Gi RAM per replica |
| Sidecar proxy (per pod) | ~100m CPU, ~128Mi RAM baseline |
| 100-pod cluster sidecar overhead | ~10 CPU cores, ~12Gi RAM |

For a 100-pod cluster, the sidecar tax is roughly 10 additional CPU cores and 12 GiB RAM. This is significant. Make sure the value justifies the cost.

## Common Mistakes

1. **Adding a mesh "because Netflix uses one"** -- Netflix has thousands of services. You have 12. Network policies are fine.
2. **Self-managing Istio** -- Istio upgrades are notoriously painful. Use the managed add-on or do not use Istio.
3. **Enabling sidecar injection cluster-wide** -- Start with one namespace. Debug issues in isolation before rolling out broadly.
4. **Ignoring resource overhead** -- The sidecar memory tax adds up. A 100-pod deployment suddenly needs 12Gi more RAM.
5. **Using a mesh for encryption only** -- If you only need encryption in transit, consider Cilium WireGuard encryption (node-level, no sidecars) or pod-level TLS.
6. **Not training the team** -- A mesh adds Envoy, VirtualServices, DestinationRules, PeerAuthentication, and AuthorizationPolicy to your operational surface. Budget learning time.

## Decision Checklist

Before enabling a service mesh, answer yes to at least two:

- [ ] Do you have more than 20 services communicating internally?
- [ ] Is mTLS between all services a hard compliance requirement?
- [ ] Do you need per-service traffic splitting (not just at ingress)?
- [ ] Do you need automatic retries/timeouts without application changes?
- [ ] Do you operate in a multi-cluster topology?

If you checked zero or one: use Cilium network policies and call it done.

## Resources

- [Istio-based Service Mesh Add-on](https://learn.microsoft.com/en-us/azure/aks/istio-about)
- [Enable Istio Add-on](https://learn.microsoft.com/en-us/azure/aks/istio-deploy-addon)
- [Cilium Service Mesh](https://docs.cilium.io/en/stable/network/servicemesh/)
- [AKS Network Policies with Cilium](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [AKS Labs](https://azure-samples.github.io/aks-labs)

---

**Previous**: [Private Clusters](./private-clusters)
