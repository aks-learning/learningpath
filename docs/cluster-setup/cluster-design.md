---
sidebar_position: 2
title: Cluster Design Decisions
description: Key decisions when designing your AKS cluster
---

# Cluster Design Decisions

<span className="badge--intermediate">🟡 Intermediate</span>

Before creating a cluster, you need to make several architectural decisions.

## Decision Matrix

| Decision | Options | Guidance |
|----------|---------|----------|
| **SKU** | Automatic / Standard / Free | [See comparison](../getting-started/aks-automatic-vs-standard) |
| **Networking** | CNI Overlay (recommended) / Azure CNI / Kubenet | [See networking](../networking/cni-comparison) |
| **Identity** | Entra ID + Azure RBAC (recommended) / Local accounts | [See identity](../security/identity) |
| **Node pools** | System + User separation (recommended) | Isolate system workloads |
| **Availability** | Availability Zones (recommended) / Single zone | Use zones for production |
| **Registry** | Azure Container Registry with managed identity | Secure image pull |
| **Tier** | Standard for production / Free for dev/test | SLA requirements |

## Node Pool Strategy

```yaml
Node Pools:
  - name: system
    mode: System
    vmSize: Standard_D4s_v5
    count: 3
    zones: [1, 2, 3]
    
  - name: workload
    mode: User
    vmSize: Standard_D8s_v5
    minCount: 3
    maxCount: 20
    zones: [1, 2, 3]
    autoscaling: true

  - name: gpu (optional)
    mode: User
    vmSize: Standard_NC24ads_A100_v4
    count: 0
    maxCount: 4
    taints: ["sku=gpu:NoSchedule"]
```

## Resources

- 📄 [AKS Baseline Architecture](https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks/baseline-aks)
- 📄 [Best Practices for Cluster Operators](https://learn.microsoft.com/en-us/azure/aks/best-practices)
- 📄 [Quotas and SKU Regions](https://learn.microsoft.com/en-us/azure/aks/quotas-skus-regions)
