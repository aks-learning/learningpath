---
sidebar_position: 3
title: "Reliability and High Availability"
description: "Opinionated guide to AKS reliability patterns, availability zones, probes, and multi-region architecture."
---

# Reliability and High Availability

A single AKS cluster with default settings will fail you in production. Nodes die. Zones go offline. Pods crash silently. You need to design for failure from day one, not bolt it on after your first outage.

## Availability Zones

Spread your nodes across 3 availability zones. This is non-negotiable for production.

```bash
# Create a zone-redundant node pool
az aks nodepool add \
  --resource-group myRG \
  --cluster-name myCluster \
  --name workload \
  --zones 1 2 3 \
  --node-count 3
```

:::tip If your region supports zones, use them. Always.
The incremental cost is zero -- you pay the same per node whether it is in one zone or spread across three. But the resilience improvement is massive. A single-zone failure takes out 33% of your capacity instead of 100%.
:::

| Configuration | Zone Failure Impact | Production Ready? |
|---------------|--------------------|--------------------|
| No zones | 100% loss | No |
| 2 zones | 50% loss | Marginal |
| 3 zones | 33% loss (survives) | Yes |

## Pod Topology Spread Constraints

Availability zones protect against infrastructure failure. Topology spread constraints protect against bad scheduling. Without them, Kubernetes might schedule all your replicas on the same node.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 6
  template:
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: my-app
      - maxSkew: 1
        topologyKey: kubernetes.io/hostname
        whenUnsatisfiable: ScheduleAnyway
        labelSelector:
          matchLabels:
            app: my-app
```

:::warning The most common reliability mistake
Deploying all pods on one node, then losing everything when that node fails. Use topology spread constraints with `topologyKey: kubernetes.io/hostname` to distribute pods across nodes, and `topology.kubernetes.io/zone` to distribute across zones.
:::

## Pod Disruption Budgets

PDBs define the minimum availability during voluntary disruptions (upgrades, node drains, scale-downs). Without them, Kubernetes will evict all your pods simultaneously.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: my-app-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: my-app
```

Use `minAvailable` for services that need N instances running at all times. Use `maxUnavailable` when you want to express "at most 1 pod down at a time."

## Liveness and Readiness Probes

Every production pod MUST have both a liveness probe and a readiness probe. They serve different purposes.

| Probe | Purpose | Failure Action |
|-------|---------|----------------|
| Liveness | "Is this pod stuck?" | Kill and restart the pod |
| Readiness | "Can this pod serve traffic?" | Remove from Service endpoints |
| Startup | "Is this pod still initializing?" | Delay liveness checks |

```yaml
spec:
  containers:
  - name: my-app
    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      initialDelaySeconds: 10
      periodSeconds: 15
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      initialDelaySeconds: 5
      periodSeconds: 5
      failureThreshold: 2
```

:::info No probes = no production
Kubernetes cannot help you if it does not know your pod is unhealthy. Without a liveness probe, a deadlocked pod sits there forever consuming resources. Without a readiness probe, traffic routes to pods that cannot serve it.
:::

## AKS SLA Tiers

| Tier | SLA | Availability Zones | Use Case |
|------|-----|-------------------|----------|
| Free | None (best effort) | Optional | Dev/test, learning |
| Standard | 99.95% | Optional (99.99% with zones) | Production |
| Premium | 99.95% (+ LTS, mission-critical features) | Optional (99.99% with zones) | Regulated, enterprise |

Use Standard tier at minimum for anything that serves real users. The Free tier offers no SLA -- the control plane can be unavailable and Microsoft owes you nothing.

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --tier standard
```

## Multi-Region Architecture

For mission-critical workloads that need near-zero downtime, deploy two clusters in different regions behind Azure Front Door.

**Architecture**: Azure Front Door -> Cluster A (East US 2) + Cluster B (West US 2)

Requirements:
- Both clusters run identical workloads via GitOps
- Azure Front Door handles global load balancing and failover
- Stateless services replicate trivially; stateful services need a distributed data layer (Cosmos DB, Azure SQL with geo-replication)
- DNS TTL must be low (30-60 seconds) for fast failover

:::tip Start with single-region, multi-zone
Multi-region is expensive and complex. For most workloads, a single region with 3 availability zones gives you 99.99% SLA. Only go multi-region if your RTO is under 1 minute or you need geographic redundancy for compliance.
:::

## Reliability Checklist

- [ ] Node pools span 3 availability zones
- [ ] Topology spread constraints on all deployments
- [ ] PDBs on all production workloads
- [ ] Liveness and readiness probes on every container
- [ ] Standard or Premium SLA tier enabled
- [ ] At least 3 replicas for critical services
- [ ] Resource requests and limits set (prevents noisy neighbors)
- [ ] Cluster autoscaler enabled with appropriate min/max

## Resources

- [Best Practices for App and Cluster Reliability](https://learn.microsoft.com/en-us/azure/aks/best-practices-app-cluster-reliability)
- [Deployment Safeguards in AKS](https://learn.microsoft.com/en-us/azure/aks/deployment-safeguards)
- [Availability Zones in AKS](https://learn.microsoft.com/en-us/azure/aks/availability-zones)
- [AKS SLA](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers)
- [Mission-Critical Workloads on AKS](https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-mission-critical/mission-critical-intro)
