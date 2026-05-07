---
sidebar_position: 1
title: "Networking Fundamentals in AKS"
description: "AKS networking is Azure VNet-native. Understand the three networking models, IP planning, DNS, and why Cilium is the only network policy engine worth using."
---

# Networking Fundamentals in AKS

AKS networking is not Kubernetes networking with an Azure wrapper. It is Azure VNet-native networking that happens to run Kubernetes. Your pods get real IPs -- either inside your VNet directly or inside an overlay network with nodes bridging traffic. Understanding this distinction is the foundation for every networking decision you will make.

## The Three Networking Models

| Model | Pod IPs | Node IPs | Status |
|-------|---------|----------|--------|
| **Azure CNI** | VNet subnet IPs | VNet subnet IPs | Production-ready, IP-heavy |
| **Azure CNI Overlay** | Overlay CIDR (private) | VNet subnet IPs | Production-ready, recommended |
| **Kubenet** | Node-level NAT | VNet subnet IPs | Deprecated. Do not use. |

:::tip The 90% Rule
Use Azure CNI Overlay for 90% of workloads. Only use Azure CNI (non-overlay) when you need pods directly addressable from the VNet -- meaning external systems must initiate connections to specific pod IPs without going through a Service or Ingress.
:::

## IP Address Planning

This is where teams get burned. Plan your CIDRs before creating the cluster:

```bash
# Example: Creating a cluster with proper CIDR planning
az aks create \
  --name myaks \
  --resource-group myrg \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --pod-cidr 192.168.0.0/16 \
  --service-cidr 10.0.0.0/16 \
  --dns-service-ip 10.0.0.10 \
  --vnet-subnet-id /subscriptions/.../subnets/aks-subnet
```

| CIDR | Purpose | Sizing Guidance |
|------|---------|-----------------|
| **Pod CIDR** | IP pool for all pods (overlay only) | /16 gives 65k IPs. Use it. |
| **Service CIDR** | ClusterIP range for Kubernetes Services | /16 is generous, /20 minimum |
| **Subnet CIDR** | VNet subnet for nodes | Size for max nodes + 30% headroom |
| **DNS Service IP** | Must be inside Service CIDR | Conventionally .10 of the range |

:::warning
You cannot change Pod CIDR or Service CIDR after cluster creation. Get this right on day one or face a cluster rebuild.
:::

## DNS: CoreDNS

Every AKS cluster runs CoreDNS for in-cluster name resolution. Services get DNS entries like `my-svc.my-namespace.svc.cluster.local`. This is standard Kubernetes.

What matters in production:

- **Custom DNS**: Use `coredns-custom` ConfigMap for forwarding corporate domains to on-prem DNS
- **ndots setting**: The default `ndots:5` causes excessive DNS lookups. Set it to 2 in your pod specs for external-heavy workloads
- **DNS autoscaling**: CoreDNS scales with node count via `cluster-proportional-autoscaler`

```yaml
# Reduce DNS lookup noise for pods calling external APIs
apiVersion: v1
kind: Pod
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"
```

## kube-proxy vs Cilium eBPF Data Plane

Traditional AKS uses kube-proxy (iptables mode) for Service routing. This works but scales poorly past 5,000 Services and gives you zero observability into traffic flows.

:::tip
Enable Cilium for network policies. Do not use Azure NPM or Calico -- Cilium is the future and gives you eBPF observability for free. With ACNS (Advanced Container Networking Services), you get DNS-aware policies, flow logs, and Hubble UI out of the box.
:::

```bash
# Create cluster with Cilium data plane (replaces kube-proxy)
az aks create \
  --name myaks \
  --resource-group myrg \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --pod-cidr 192.168.0.0/16
```

With Cilium as your data plane:
- **No kube-proxy** -- eBPF handles Service routing at kernel level
- **Network policies** -- Cilium Network Policies (more expressive than Kubernetes NetworkPolicy)
- **Hubble** -- Flow visibility, DNS logging, HTTP-aware policies
- **Performance** -- Constant-time lookups vs iptables linear chain walking

## Network Policies: The Non-Negotiable

In production at scale, you must enforce network policies. Without them, any compromised pod can reach any other pod in the cluster -- including your database pods, secrets stores, and control plane components.

```yaml
# Deny all ingress by default, then allow explicitly
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

Start with deny-all in every namespace, then punch holes as needed. This is the only sane default for production workloads.

## Common Mistakes

1. **Using Kubenet for new clusters** -- It is deprecated. There is no reason to choose it in 2025.
2. **Undersizing the node subnet** -- Forgetting that AKS reserves IPs for system pods, upgrades (surge), and load balancers.
3. **Ignoring ndots** -- A pod making 10 external API calls generates 50 DNS queries with the default ndots:5.
4. **Choosing Azure NPM for network policies** -- It is maintenance-mode. Cilium is actively developed and offers superset functionality.
5. **Not enabling network policies at all** -- By default, all pods can talk to all pods. This is unacceptable in production.
6. **Overlapping CIDRs** -- Pod CIDR, Service CIDR, and VNet address space must not overlap. Sounds obvious, gets missed in multi-cluster setups.

## Resources

- [AKS Networking Concepts](https://learn.microsoft.com/en-us/azure/aks/concepts-network)
- [Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/azure-cni-overlay)
- [Advanced Container Networking Services](https://learn.microsoft.com/en-us/azure/aks/advanced-container-networking-services-overview)
- [Cilium on AKS](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [AKS Labs - Networking](https://azure-samples.github.io/aks-labs)

---

**Next**: [CNI Comparison](./cni-comparison) -- pick the right CNI for your cluster.
