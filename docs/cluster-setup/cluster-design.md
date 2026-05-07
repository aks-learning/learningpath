---
sidebar_position: 1
title: "Cluster Design Decisions"
description: "Opinionated guidance on AKS cluster topology, node pools, VM SKUs, and naming conventions"
---

# Cluster Design Decisions

Get these decisions right on day one. Changing cluster topology later means downtime, migration, and pain.

## Single Cluster vs Multi-Cluster

Start with one cluster. Use namespace isolation with network policies to separate teams and environments. Graduate to multi-cluster only when you need blast radius reduction, multi-region failover, or hard compliance boundaries between workloads.

:::warning Common Mistake

Teams spin up a cluster per environment (dev, staging, prod) on day one. You end up managing 9 clusters before you have a single production workload. Start with one cluster, three namespaces.
:::

| Scenario | Recommendation |
|----------|---------------|
| Single team, single region | One cluster, namespace isolation |
| Multiple teams, shared compliance | One cluster, namespace + network policy isolation |
| Multi-region or hard blast radius | Multi-cluster with GitOps |
| Regulated workloads next to non-regulated | Separate clusters, separate subscriptions |

## Node Pool Strategy

Separate system pools from user pools. Never mix your workloads into the system pool.

```bash
# System pool: dedicated to kube-system components
az aks nodepool add \
  --cluster-name myaks \
  --resource-group myrg \
  --name system \
  --mode System \
  --node-vm-size Standard_D4s_v5 \
  --node-count 3 \
  --zones 1 2 3 \
  --node-taints CriticalAddonsOnly=true:NoSchedule

# User pool: your actual workloads
az aks nodepool add \
  --cluster-name myaks \
  --resource-group myrg \
  --name apps \
  --mode User \
  --node-vm-size Standard_D8s_v5 \
  --min-count 3 \
  --max-count 20 \
  --enable-cluster-autoscaler \
  --zones 1 2 3
```

:::tip Opinion

System node pool: `Standard_D4s_v5`, 3 nodes, tainted with `CriticalAddonsOnly`. User pools: pick based on workload. Never mix workloads in the system pool -- a misbehaving app pod should never starve CoreDNS.
:::

## VM SKU Selection

| Series | Use Case | Opinion |
|--------|----------|---------|
| D-series v5 | General compute, web apps, APIs | Default choice for most workloads |
| E-series v5 | Memory-intensive (caches, in-memory DBs) | When your app needs >8GB per core |
| N-series | GPU, ML/AI inference and training | See [GPU Node Pools](../ai-workloads/gpu-node-pools) |
| B-series | Burstable, dev/test only | Never for production. Unpredictable performance. |
| F-series v2 | Compute-optimized batch processing | High CPU-to-memory ratio workloads |

:::warning

B-series VMs throttle CPU after consuming burst credits. Your production workload will randomly slow down under sustained load. Use D-series instead.
:::

## Region Selection

Pick a region that supports Availability Zones and is close to your users. Check GPU SKU availability before committing if you plan AI workloads.

```bash
# Check if your desired VM SKU is available in the region
az vm list-skus --location eastus2 --size Standard_D8s_v5 --output table
```

Preferred regions for new deployments: East US 2, West US 3, North Europe, West Europe. All have full AZ support and broad SKU availability.

## Naming Conventions

Consistency prevents confusion at scale:

| Resource | Pattern | Example |
|----------|---------|---------|
| Cluster | `aks-{app}-{env}-{region}` | `aks-platform-prod-eus2` |
| Node pool | `{workload}{size}` | `apps`, `gpua100`, `system` |
| Namespace | `{team}-{service}` | `payments-api`, `data-pipeline` |
| Resource group | `rg-{app}-{env}-{region}` | `rg-platform-prod-eus2` |

:::info

Node pool names are limited to 12 characters (Linux) or 6 characters (Windows). Keep them short and meaningful.
:::

## Resources

- [AKS Baseline Architecture](https://learn.microsoft.com/azure/architecture/reference-architectures/containers/aks/baseline-aks)
- [VM sizes for AKS](https://learn.microsoft.com/azure/aks/quotas-skus-regions)
- [Availability Zones in AKS](https://learn.microsoft.com/azure/aks/availability-zones)
