---
sidebar_position: 3
title: "Cost Optimization"
description: "Practical strategies to cut AKS costs 40-60% without sacrificing reliability"
---

# Cost optimization

Spot for batch/dev, Reserved Instances for baseline prod, on-demand for burst. This combination saves 40-60% vs pure on-demand pricing.

## The cost strategy stack

| Strategy | Savings | Applies To | Trade-off |
|----------|---------|-----------|-----------|
| Spot instances | 60-90% | Dev/test, batch jobs, training | Eviction risk |
| Reserved Instances (1yr) | 30-40% | Steady-state production nodes | Commitment |
| Reserved Instances (3yr) | 50-60% | Predictable long-running workloads | Longer commitment |
| Savings Plans | 20-30% | Flexible compute commitment | Less savings than RI |
| Scale to zero (non-prod) | 60%+ | Dev/test clusters at night | Cold start delay |
| Right-sizing | 20-40% | Over-provisioned workloads | Requires analysis |

:::tip Opinion

Turn off dev/test clusters at night. That's 60% of the time they're running for nothing. A 3-node dev cluster costs ~$500/month. Shutting it down 14 hours/day saves $300/month per cluster.
:::

## Spot node pools

Spot VMs are spare Azure capacity at 60-90% discount. Azure can evict them with 30 seconds notice.

```bash
# Add spot pool for batch/dev workloads
az aks nodepool add \
  --resource-group myrg \
  --cluster-name myaks \
  --name spot \
  --priority Spot \
  --eviction-policy Delete \
  --spot-max-price -1 \
  --node-vm-size Standard_D8s_v5 \
  --min-count 0 \
  --max-count 20 \
  --enable-cluster-autoscaler \
  --node-taints "kubernetes.azure.com/scalesetpriority=spot:NoSchedule"
```

| Workload Type | Use Spot? | Why |
|---------------|-----------|-----|
| Dev/test environments | Yes | Eviction just means restart |
| Batch processing | Yes | Re-queue failed jobs |
| ML training (with checkpoints) | Yes | Resume from last checkpoint |
| Stateless web frontends (non-prod) | Yes | Scale-out handles evictions |
| Production APIs | No | User-facing availability required |
| Databases | Never | Data loss risk on eviction |

## Reserved instances

For nodes that run 24/7/365, buy RIs. The math is simple.

```
On-demand D8s_v5: ~$280/month
1-year RI:        ~$180/month (36% savings)
3-year RI:        ~$120/month (57% savings)
```

:::info

Buy RIs for your system node pool and production baseline. These nodes always run. Use on-demand for autoscaler burst capacity that comes and goes.
:::

## Scale to zero: non-production clusters

```yaml
# KEDA cron scaler: scale to 0 at night, back up in morning
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: workday-scaler
  namespace: dev
spec:
  scaleTargetRef:
    name: my-app
  minReplicaCount: 0
  maxReplicaCount: 5
  triggers:
    - type: cron
      metadata:
        timezone: America/New_York
        start: "0 8 * * 1-5"
        end: "0 22 * * 1-5"
        desiredReplicas: "3"
```

For entire node pools, the cluster autoscaler handles scale-to-zero when no pods need scheduling.

## Right-sizing workloads

Most teams over-request CPU and memory. Use VPA recommendations to find actual utilization:

```bash
# Install metrics-server (usually pre-installed in AKS)
kubectl top pods --all-namespaces --sort-by=cpu

# Check requests vs actual usage
kubectl top pod my-pod --containers
# If actual is 50m CPU but request is 500m, you're wasting 90%
```

:::warning Common Mistake

Setting CPU requests at 1 core "just to be safe" when the pod uses 50m. Ten pods like this reserve 10 cores but use 0.5. That's 9.5 cores of wasted capacity you're paying for.
:::

## Cluster Autoscaler tuning

```bash
# Aggressive scale-down for non-critical pools
az aks nodepool update \
  --resource-group myrg \
  --cluster-name myaks \
  --name apps \
  --update-config scale-down-delay-after-add=5m \
  --update-config scale-down-unneeded-time=5m \
  --update-config scale-down-utilization-threshold=0.5
```

| Setting | Production | Dev/Test |
|---------|-----------|----------|
| `scale-down-unneeded-time` | 10m | 3m |
| `scale-down-delay-after-add` | 10m | 5m |
| `scale-down-utilization-threshold` | 0.5 | 0.3 |
| `max-graceful-termination-sec` | 600 | 60 |

## Quick wins checklist

1. **Spot pools for dev/test** -- Immediate 60-90% savings on non-prod compute.
2. **RIs for system + prod baseline** -- 30-57% savings on nodes that always run.
3. **Scale non-prod to zero at night** -- 60% time savings.
4. **Right-size requests** -- Review top pods output monthly.
5. **Delete orphaned disks** -- PVCs with `Delete` policy that failed leave disks behind.
6. **Use Standard tier only for prod** -- Free tier for dev/test saves the tier cost.

## Resources

- [AKS cost optimization](https://learn.microsoft.com/azure/aks/best-practices-cost)
- [Spot node pools](https://learn.microsoft.com/azure/aks/spot-node-pool)
- [Cluster autoscaler](https://learn.microsoft.com/azure/aks/cluster-autoscaler)
- [Azure Reservations](https://learn.microsoft.com/azure/cost-management-billing/reservations/save-compute-costs-reservations)
