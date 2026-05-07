---
sidebar_position: 2
title: "Cluster Autoscaler"
description: "Automatically add and remove nodes based on pod scheduling pressure. Stop paying for idle VMs."
---

# Cluster Autoscaler

HPA scales pods. Cluster Autoscaler scales the nodes those pods run on. Without it, HPA creates pods that sit in Pending state forever because there is nowhere to schedule them.

## How It Works

The logic is straightforward:

1. **Scale up**: A pod is unschedulable (no node has enough resources). CA provisions a new node.
2. **Scale down**: A node is underutilized (below threshold) for a sustained period. CA drains and removes it.

:::info
Cluster Autoscaler does NOT look at CPU/memory utilization on nodes. It looks at **scheduling failures** (scale up) and **pod packing density** (scale down). This is a critical distinction most teams get wrong.
:::

## Enabling on AKS

```bash
# Enable on existing node pool
az aks nodepool update \
  --resource-group myRG \
  --cluster-name myAKS \
  --name nodepool1 \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 10

# Or during cluster creation
az aks create \
  --resource-group myRG \
  --name myAKS \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 10 \
  --node-vm-size Standard_D4s_v5
```

## Key Parameters

| Parameter | Recommended Value | Rationale |
|-----------|------------------|-----------|
| `min-count` | 2 | Survive a single node failure |
| `max-count` | Budget-dependent | Set this based on cost ceiling, not wishful thinking |
| `scan-interval` | 10s (default) | Default is fine. Faster scanning wastes API calls |
| `scale-down-delay-after-add` | 10m | New nodes need time to receive pods. Removing them immediately is wasteful |
| `scale-down-utilization-threshold` | 0.5 | Node must be below 50% utilized to be a removal candidate |
| `scale-down-unneeded-time` | 10m | Node must be underutilized for 10 min before removal |

:::warning
Set `scale-down-delay-after-add` to at least 10 minutes. Without this, CA adds a node, pods schedule, some finish quickly, node looks underutilized, CA removes it, pods go Pending, CA adds again. This thrashing wastes money and creates instability.
:::

## Node Autoprovision (NAP) vs Cluster Autoscaler

| Feature | Cluster Autoscaler | NAP (AKS Automatic) |
|---------|-------------------|---------------------|
| Node pool creation | Manual (you define pools) | Automatic (picks VM SKU) |
| SKU selection | You choose upfront | Matches workload requirements |
| Multiple workload types | Requires multiple pools | Handles automatically |
| GPU/Spot support | Manual pool config | Automatic based on tolerations |
| Complexity | Medium | Low |

If you are on **AKS Automatic**, NAP handles node scaling for you. It reads pod resource requests and tolerations, then picks the best VM SKU and creates node pools on demand. Stop managing node pools manually.

If you are on **AKS Standard**, use Cluster Autoscaler with purpose-built node pools.

## Best Practice: Multiple Node Pools

Do not run everything on a single `Standard_D4s_v5` node pool. Segment by workload class:

```bash
# General workloads
az aks nodepool add --name general \
  --node-vm-size Standard_D4s_v5 \
  --enable-cluster-autoscaler --min-count 2 --max-count 10

# Memory-intensive (caches, in-memory DBs)
az aks nodepool add --name highmem \
  --node-vm-size Standard_E4s_v5 \
  --enable-cluster-autoscaler --min-count 0 --max-count 5 \
  --labels workload=memory-intensive

# GPU workloads (ML inference)
az aks nodepool add --name gpu \
  --node-vm-size Standard_NC6s_v3 \
  --enable-cluster-autoscaler --min-count 0 --max-count 3 \
  --labels workload=gpu --node-taints gpu=true:NoSchedule
```

:::tip
Set `min-count 0` on specialized pools (GPU, high-memory). Let them scale to zero when no workloads need them. Only your general pool needs a non-zero minimum.
:::

## Common Mistakes

**Setting max-count too low.** During a traffic spike, CA hits the ceiling and your pods stay Pending. Monitor unschedulable pod events and increase max-count before you need it.

**Not using Pod Disruption Budgets.** When CA removes a node, it evicts pods. Without a PDB, all replicas on that node can terminate simultaneously. Always set PDBs for production workloads.

**Ignoring node startup time.** A new AKS node takes 2-4 minutes to become Ready. CA cannot provide instant capacity. Plan for this latency with appropriate HPA headroom.

**Single node pool for everything.** A memory-heavy pod on a CPU-optimized node wastes resources. Use node affinity and taints to match workloads to appropriate VM SKUs.

**Forgetting availability zones.** Configure `--zones 1 2 3` on node pools. CA respects zone topology and distributes nodes across zones for high availability.

## Monitoring Cluster Autoscaler

```bash
# Check CA status
kubectl -n kube-system get configmap cluster-autoscaler-status -o yaml

# View CA logs
kubectl -n kube-system logs -l app=cluster-autoscaler --tail=50

# Check for unschedulable pods
kubectl get pods --field-selector=status.phase=Pending
```

## Resources

- [AKS Cluster Autoscaler](https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler-overview)
- [Node Autoprovision](https://learn.microsoft.com/en-us/azure/aks/node-autoprovision)
- [Cluster Autoscaler Parameters](https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler#cluster-autoscaler-profile-settings)
