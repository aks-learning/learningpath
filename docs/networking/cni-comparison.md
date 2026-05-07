---
sidebar_position: 2
title: "CNI Options: Which One to Pick"
description: "Stop deliberating. Use Azure CNI Overlay with Cilium. Here is why, and the rare cases where you should deviate."
---

# CNI options: which one to pick

Azure CNI Overlay + Cilium. That is the recommendation for 2025. If you are starting a new cluster and have no legacy constraints, stop reading after this sentence and go build it.

Still here? Good -- let's cover why, and the edge cases where you deviate.

## Decision tree

![CNI Decision Tree](/img/cni-decision-tree.svg)

## Full comparison

| Feature | Azure CNI | Azure CNI Overlay | Azure CNI + Cilium | Kubenet | BYO CNI |
|---------|-----------|-------------------|-------------------|---------|---------|
| **Pod IP source** | VNet subnet | Overlay CIDR | Overlay CIDR | Node NAT | Varies |
| **IP consumption from VNet** | 1 IP per pod (heavy) | 1 IP per node only | 1 IP per node only | 1 IP per node | Varies |
| **Max pods/node** | 250 | 250 | 250 | 110 | Varies |
| **Network policy engine** | Azure NPM, Calico | Azure NPM, Calico | Cilium (eBPF) | Calico only | BYO |
| **Windows node pools** | Yes | Yes | No | No | No |
| **Direct pod addressability** | Yes | No (NAT) | No (NAT) | No (NAT) | Varies |
| **eBPF dataplane** | No | No | Yes | No | Varies |
| **Hubble observability** | No | No | Yes | No | No |
| **kube-proxy replacement** | No | No | Yes | No | Varies |
| **Status** | GA, supported | GA, recommended | GA, recommended | Deprecated | Unsupported by MS |

## The recommendation

:::tip

Use Azure CNI Overlay with Cilium dataplane for every new cluster unless you have a specific, documented reason not to.
:::

```bash
# The golden path: CNI Overlay + Cilium
az aks create \
  --name production-cluster \
  --resource-group production-rg \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --pod-cidr 192.168.0.0/16 \
  --service-cidr 10.0.0.0/16 \
  --dns-service-ip 10.0.0.10 \
  --node-count 3 \
  --tier standard
```

This gives you:
- Efficient IP usage (only nodes consume VNet IPs)
- eBPF-powered Service routing (faster than iptables)
- Cilium Network Policies (L3/L4/L7, DNS-aware)
- Hubble flow logs and observability
- No kube-proxy overhead

## When to deviate

### Use Azure CNI (non-overlay) when:

| Scenario | Why |
|----------|-----|
| Pods must be directly addressable from VNet | Legacy apps connect to pod IPs, not Services |
| Compliance requires no overlay/NAT | Regulated environments demanding full IP traceability |
| Integration with Azure services via VNet | Services that cannot route through a Load Balancer |

```bash
# Azure CNI (non-overlay) -- IP heavy, plan your subnet
az aks create \
  --name legacy-integration \
  --resource-group myrg \
  --network-plugin azure \
  --vnet-subnet-id /subscriptions/.../subnets/large-subnet \
  --max-pods 50  # Reduce to control IP consumption
```

:::warning

With Azure CNI (non-overlay), a 3-node cluster running 50 pods each consumes 153 VNet IPs (3 nodes + 150 pods). A /24 subnet (251 usable) barely fits one node pool. Plan a /21 or larger.
:::

### Use Azure CNI (non-overlay) for Windows containers:

Windows node pools do not support Cilium. If you must run Windows containers, use Azure CNI or Azure CNI Overlay without Cilium. This is the only scenario where Azure NPM or Calico makes sense.

### BYO CNI -- do not do this unless you are Cilium/Calico experts:

AKS supports `--network-plugin none` for bring-your-own CNI. Microsoft will not support your networking layer. You own debugging, upgrades, and compatibility. The only valid reason: you are already running a CNI fleet-wide (e.g., Tigera Enterprise Calico) and need feature parity across clouds.

## Kubenet: dead technology walking

Kubenet is deprecated. Do not start new clusters with it. Here is why:

- Max 110 pods per node (hard limit)
- No Cilium support
- No Windows support
- UDR management overhead (Azure creates routes per node)
- Route table limits at 400 nodes
- No path to modern features (ACNS, Hubble, eBPF)

If you have existing Kubenet clusters, plan migration to CNI Overlay. It requires a cluster rebuild -- there is no in-place upgrade path.

## IP planning cheat sheet

| CNI Mode | Subnet sizing formula | Example (100 nodes, 50 pods/node) |
|----------|----------------------|-----------------------------------|
| Azure CNI | (nodes * max_pods) + nodes + overhead | 5,100+ IPs needed (/19 minimum) |
| CNI Overlay | nodes + overhead | 130 IPs needed (/24 is fine) |
| Kubenet | nodes + overhead | 130 IPs needed (/24 is fine) |

The IP efficiency alone makes CNI Overlay the obvious choice for most teams.

## Migration path

Existing clusters cannot switch CNI modes in-place. The migration path is:

1. Create new cluster with target CNI (Overlay + Cilium)
2. Deploy workloads to new cluster
3. Shift traffic (DNS, Traffic Manager, Front Door)
4. Decommission old cluster

:::info

Use blue-green cluster deployments. Do not attempt in-place CNI changes -- they are not supported and will break your cluster.
:::

## Common mistakes

1. **Choosing Azure CNI without IP planning** -- Running out of IPs at 2 AM during an autoscale event.
2. **Selecting Kubenet "because it is simpler"** -- You are choosing technical debt on day one.
3. **Using Azure NPM when Cilium is available** -- Azure NPM is maintenance-mode. Cilium is the investment.
4. **Forgetting dual-stack** -- If you need IPv6, only Azure CNI Overlay supports it cleanly.
5. **Oversizing subnets for CNI Overlay** -- You only need IPs for nodes, not pods. Do not waste a /16 VNet range.

## Resources

- [Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/azure-cni-overlay)
- [Azure CNI Powered by Cilium](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [Configure Azure CNI](https://learn.microsoft.com/en-us/azure/aks/configure-azure-cni)
- [Advanced Container Networking Services](https://learn.microsoft.com/en-us/azure/aks/advanced-container-networking-services-overview)
- [AKS Labs - Networking](https://azure-samples.github.io/aks-labs)

---

**Next**: [Ingress and Load Balancing](./ingress) -- how to expose your workloads.
