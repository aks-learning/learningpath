---
sidebar_position: 2
title: CNI Options Comparison
description: Comparing Azure CNI, CNI Overlay, and Kubenet for AKS
---

# CNI Options Comparison

<span className="badge--intermediate">🟡 Intermediate</span>

Choosing the right CNI (Container Network Interface) is a foundational decision.

## Comparison Table

| Feature | Azure CNI | Azure CNI Overlay | Kubenet |
|---------|:---------:|:-----------------:|:-------:|
| **Pod IP source** | VNet subnet | Overlay (private) | Node-level NAT |
| **IP consumption** | High (1 IP/pod) | Low (overlay) | Low (NAT) |
| **Max pods/node** | 250 | 250 | 110 |
| **Network Policies** | Azure + Calico + Cilium | Azure + Calico + Cilium | Calico only |
| **Windows support** | ✅ | ✅ | ❌ |
| **Direct VNet connectivity** | ✅ Pods routable in VNet | ❌ NAT required | ❌ NAT required |
| **Performance** | Excellent | Excellent | Good |
| **Recommended for** | Pods need VNet IPs | Most workloads (default) | Legacy/simple |
| **Cilium support** | ❌ | ✅ (powered by Cilium) | ❌ |

## Recommendation

```
┌─────────────────────────────────────────────────┐
│ Do pods need to be directly routable in VNet?    │
│                                                   │
│  YES → Azure CNI                                 │
│  NO  → Do you need Cilium / advanced features?   │
│         YES → Azure CNI Overlay (Cilium)         │
│         NO  → Azure CNI Overlay (default)        │
└─────────────────────────────────────────────────┘

⚠️ Kubenet is legacy — avoid for new clusters
```

## Resources

- 📄 [Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/concepts-network-azure-cni-overlay)
- 📄 [Azure CNI](https://learn.microsoft.com/en-us/azure/aks/configure-azure-cni)
- 📄 [Kubenet](https://learn.microsoft.com/en-us/azure/aks/configure-kubenet)
- 📖 [Blog: Advanced Container Networking Services](https://blog.aks.azure.com/)
