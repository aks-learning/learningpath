---
sidebar_position: 3
title: "Cost Management for AKS"
description: "The number one cost waste in AKS is overprovisioned nodes. Right-size aggressively and track costs per namespace."
---

# Cost Management for AKS

The number one cost waste in AKS is overprovisioned nodes. Teams request 4 CPU and 8 GB memory for a pod that uses 0.3 CPU and 200 MB. Multiply that across 50 pods and you are paying for 10 nodes when you need 3. Right-size aggressively.

## Where AKS Cost Comes From

| Component | What You Pay For | Typical % of Total |
|-----------|-----------------|-------------------|
| VMs (node pools) | Compute for your pods | 60-75% |
| Storage | Persistent volumes, OS disks | 10-20% |
| Networking | Load balancers, NAT gateway, public IPs | 5-15% |
| Egress | Data leaving Azure | 5-10% |
| Control plane | AKS management | Free (Standard tier) / $0.10/hr (Premium) |

The control plane is free on Standard tier. Your real cost is the VMs underneath. Everything else is optimization at the margins.

## Enable the AKS Cost Analysis Add-on

This is free. Enable it. It gives you namespace-level and workload-level cost visibility directly in the Azure portal.

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --enable-cost-analysis
```

:::tip

Enable the AKS cost analysis add-on on every cluster. It is free and gives you namespace-level visibility without installing third-party tools. Add KubeCost only if you need team chargebacks or showback reports.
:::

## Cost Visibility Tools

| Tool | Cost | Best For | Limitation |
|------|------|----------|------------|
| AKS Cost Analysis add-on | Free | Namespace/workload cost in portal | No historical trends beyond 60 days |
| Azure Cost Management | Free | Subscription/resource group level | Cannot see inside the cluster |
| KubeCost (open source) | Free | Detailed pod-level cost, chargebacks | Runs in-cluster, needs resources |
| OpenCost | Free | CNCF standard, lightweight | Less polished UI than KubeCost |

:::info

Azure Cost Management sees your cluster as a VM cost. It cannot tell you which namespace or pod is responsible. That is why you need the AKS add-on or KubeCost for in-cluster attribution.
:::

## Key Cost Strategies

### 1. Right-Size Your VMs

Do not pick D16s_v5 because "we might need it." Start small, monitor actual usage, scale up only when utilization justifies it.

```bash
# Check actual node utilization
kubectl top nodes

# Example output -- these nodes are oversized:
# NAME          CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# node-pool-1   850m         5%     3200Mi          12%
# node-pool-2   920m         5%     2800Mi          11%
```

If your nodes consistently run below 40% CPU and memory, you are overpaying. Downsize the VM SKU or reduce node count.

### 2. Spot Instances for Non-Critical Workloads

Use Spot node pools for batch jobs, dev/test, CI runners, and any workload that tolerates interruption. Spot VMs cost 60-90% less than on-demand.

```bash
az aks nodepool add \
  --resource-group myRG \
  --cluster-name myCluster \
  --name spotnodes \
  --priority Spot \
  --eviction-policy Delete \
  --spot-max-price -1 \
  --node-count 3 \
  --node-vm-size Standard_D4s_v5
```

:::warning

Do not run production stateful workloads on Spot nodes. They can be evicted with 30 seconds notice. Use Spot for stateless batch processing, build agents, and development environments.
:::

### 3. Reserved Instances for Steady-State

If you know you will run 10 D4s_v5 nodes for 12 months, buy Reserved Instances. Savings: 30-60% compared to pay-as-you-go.

### 4. Scale Down Non-Production at Night

A dev cluster running 24/7 costs 3x what it would cost running only business hours. Use the AKS stop/start feature or node pool scaling.

```bash
# Stop a dev cluster at night (saves 100% compute cost)
az aks stop --resource-group myRG --name dev-cluster

# Or scale down to minimum
az aks nodepool scale \
  --resource-group myRG \
  --cluster-name dev-cluster \
  --name default \
  --node-count 1
```

### 5. Resource Requests and Limits: Get Them Right

This is the single most impactful thing for cost efficiency. The Kubernetes scheduler uses **requests** to bin-pack pods onto nodes. If you request 2 CPU but use 0.1 CPU, the scheduler thinks that node slot is full.

```yaml
resources:
  requests:
    cpu: "100m"      # What you actually use (check with kubectl top)
    memory: "128Mi"
  limits:
    cpu: "500m"      # Burst ceiling
    memory: "256Mi"  # OOMKill boundary
```

:::warning

Setting requests too high wastes nodes (you pay for empty capacity). Setting them too low causes scheduling failures and evictions. Base requests on actual P95 usage from your monitoring data, not guesses.
:::

## Measuring Actual Usage vs Requests

```bash
# Compare requested vs actual for all pods in a namespace
kubectl top pods -n production --containers

# Use this KQL query in Container Insights to find over-provisioned pods
# Pods requesting >4x their actual CPU usage
Perf
| where ObjectName == "K8SContainer" and CounterName == "cpuUsageNanoCores"
| summarize AvgCPU=avg(CounterValue) by InstanceName
| join kind=inner (
    KubePodInventory | distinct ContainerName, Namespace, PodName
) on $left.InstanceName == $right.ContainerName
```

## Common Mistakes

1. **Never looking at cost** -- Teams deploy and forget. Set up monthly cost reviews per namespace owner.
2. **Uniform node pools** -- Use multiple node pools with different VM sizes. GPU workloads need GPU nodes. Web servers need cheap general-purpose nodes. Do not put them on the same expensive SKU.
3. **Ignoring egress** -- Cross-region traffic and internet egress add up. Keep services in the same region. Use private endpoints.
4. **Over-allocating PVCs** -- A 1 TB Premium SSD costs real money even if you use 10 GB. Size PVCs to actual need and use Standard SSD where IOPS requirements allow.
5. **Running monitoring on expensive nodes** -- Put observability workloads (Prometheus, logging agents) on their own cost-effective node pool.

## Monthly Cost Review Checklist

- [ ] Check node utilization (target: 60-80% CPU, 60-80% memory)
- [ ] Review namespace cost breakdown from AKS add-on
- [ ] Identify pods with requests > 4x actual usage
- [ ] Verify non-prod clusters are scaled down outside business hours
- [ ] Check for orphaned PVCs (persistent volumes with no bound pod)
- [ ] Review egress costs for unexpected spikes

## Resources

- [AKS cost analysis add-on](https://learn.microsoft.com/en-us/azure/aks/cost-analysis)
- [Azure Cost Management](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/overview-cost-management)
- [KubeCost](https://www.kubecost.com/)
- [OpenCost](https://www.opencost.io/)
- [AKS best practices for cost](https://learn.microsoft.com/en-us/azure/aks/best-practices-cost)
- [Spot node pools](https://learn.microsoft.com/en-us/azure/aks/spot-node-pool)
