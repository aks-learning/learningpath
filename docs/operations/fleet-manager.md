---
sidebar_position: 4
title: "Azure Kubernetes Fleet Manager"
description: "Opinionated guide to Fleet Manager for multi-cluster upgrade orchestration and workload management."
---

# Azure Kubernetes Fleet Manager

Fleet Manager lets you manage multiple AKS clusters as a single entity. Coordinated upgrades, workload placement, and multi-cluster networking from one control plane.

:::tip You need Fleet Manager when you have 3+ clusters

Below that threshold, manage clusters individually. The overhead of Fleet Manager is not justified for 1-2 clusters. At 3+, manual coordination of upgrades and deployments becomes error-prone and time-consuming.
:::

## When to Use Fleet Manager

| Scenario | Fleet Manager? | Why |
|----------|---------------|-----|
| 1-2 clusters | No | Manual management is fine |
| 3-5 clusters, same app | Yes | Coordinated upgrades save hours |
| 5+ clusters, multi-region | Yes | Essential for sanity |
| Multi-tenant platform | Yes | Consistent policy enforcement |
| Single cluster, multiple node pools | No | Just use AKS directly |

## Core Concepts

**Fleet Hub**: A lightweight control plane that coordinates member clusters. It does not run your workloads.

**Member Clusters**: Your existing AKS clusters joined to the fleet. They retain full independence -- Fleet Manager orchestrates, not owns.

**Update Runs**: Staged upgrade rollouts across clusters in configurable waves.

**Update Stages**: Groups of clusters upgraded together within an update run.

## Creating a Fleet

```bash
# Create the fleet hub
az fleet create \
  --resource-group myRG \
  --name myFleet \
  --location eastus2

# Join an existing AKS cluster as a member
az fleet member create \
  --resource-group myRG \
  --fleet-name myFleet \
  --name staging-cluster \
  --member-cluster-id /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/staging-aks

# Join production cluster
az fleet member create \
  --resource-group myRG \
  --fleet-name myFleet \
  --name prod-eastus \
  --member-cluster-id /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/prod-eastus-aks
```

## Update Runs: Staged Upgrades

This is the killer feature. Instead of upgrading all clusters at once and hoping for the best, you define stages that roll out sequentially.

**Example strategy**: staging -> prod-region1 -> prod-region2

```bash
# Create update run with stages
az fleet updaterun create \
  --resource-group myRG \
  --fleet-name myFleet \
  --name upgrade-to-128 \
  --upgrade-type Full \
  --kubernetes-version 1.28.5 \
  --stages @stages.json
```

The `stages.json` defines the rollout order:

```json
{
  "stages": [
    {
      "name": "staging",
      "groups": [
        { "name": "staging-group" }
      ],
      "afterStageWaitInSeconds": 3600
    },
    {
      "name": "prod-wave1",
      "groups": [
        { "name": "prod-eastus-group" }
      ],
      "afterStageWaitInSeconds": 3600
    },
    {
      "name": "prod-wave2",
      "groups": [
        { "name": "prod-westus-group" }
      ]
    }
  ]
}
```

:::info Start with fleet-level upgrade orchestration

That alone justifies Fleet Manager. The ability to stage upgrades across clusters with automatic wait periods between stages eliminates the most dangerous operational task in multi-cluster environments. Multi-cluster networking is a bonus feature on top of that.
:::

## Update Strategies

Define reusable upgrade strategies instead of recreating stages for every update run:

```bash
az fleet updatestrategy create \
  --resource-group myRG \
  --fleet-name myFleet \
  --name standard-rollout \
  --stages @stages.json
```

Then reference the strategy in update runs. This gives you consistent, repeatable upgrade patterns.

## Multi-Cluster Services (Preview)

Fleet Manager can expose Kubernetes Services across member clusters using L4 multi-cluster load balancing. Traffic from one cluster can reach pods in another cluster.

Use cases:
- Active-active deployments where any cluster can serve any request
- Gradual traffic shifting during migrations
- Cross-cluster service discovery

:::warning Multi-cluster networking adds complexity

Do not enable multi-cluster services unless you have a clear need. It introduces cross-cluster network dependencies that complicate debugging. Most teams only need coordinated upgrades.
:::

## Fleet Manager vs Manual Management

| Operation | Manual (3 clusters) | Fleet Manager |
|-----------|---------------------|---------------|
| K8s upgrade | 3 separate az aks upgrade commands, manual ordering | 1 update run, automatic staging |
| Rollback on failure | SSH into each cluster, diagnose | Fleet pauses automatically |
| Audit trail | Check each cluster's activity log | Centralized update run history |
| Policy enforcement | Apply to each cluster individually | Fleet-level ClusterResourcePlacement |
| Time to upgrade 5 clusters | Hours (sequential, manual validation) | Minutes (automated, staged) |

## Common Mistakes

1. **Adding Fleet Manager for 1-2 clusters** -- Overhead exceeds benefit. Wait until you have 3+.
2. **No wait time between stages** -- If staging breaks, you want time to catch it before prod rolls.
3. **All clusters in one stage** -- Defeats the purpose. Create meaningful waves (staging, prod-region1, prod-region2).
4. **Ignoring member cluster health** -- Fleet Manager will upgrade an unhealthy cluster. Check health before triggering update runs.

## Decision: Do You Need Fleet Manager?

![Fleet Manager Decision Tree](/img/fleet-manager-decision.svg)

## Resources

- [Azure Kubernetes Fleet Manager Overview](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/overview)
- [Create a Fleet and Join Members](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/quickstart-create-fleet-and-members)
- [Orchestrate Updates Across Clusters](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/update-orchestration)
- [Multi-Cluster Services](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/l4-load-balancing)
- [Fleet Manager CLI Reference](https://learn.microsoft.com/en-us/cli/azure/fleet)
