---
sidebar_position: 1
title: "Horizontal Pod Autoscaler"
description: "Scale pods automatically based on CPU, memory, and custom metrics. Stop guessing replica counts."
---

# Horizontal Pod Autoscaler

ALWAYS configure HPA for production workloads. A fixed replica count means you are either wasting money during low traffic or about to crash during high traffic. There is no middle ground.

## How HPA Works

The HPA controller checks metrics every 15 seconds (configurable). It compares current utilization against your target and adjusts replica count accordingly:

```
desiredReplicas = ceil(currentReplicas * (currentMetric / targetMetric))
```

:::warning
HPA uses **requests-based utilization**, not actual node capacity. If your pod requests 100m CPU and uses 80m, HPA sees 80% utilization. Get your requests wrong and HPA makes wrong decisions. Always right-size requests first.
:::

## Essential Configuration

| Parameter | Recommendation | Why |
|-----------|---------------|-----|
| `minReplicas` | 2+ for production | Single replica = zero availability during restarts |
| `maxReplicas` | Set to what your budget allows | Unbounded scaling will bankrupt you |
| `targetCPUUtilization` | 60-70% | Leaves headroom for traffic spikes before new pods are ready |
| `stabilizationWindowSeconds` | 300 (scale-down) | Prevents thrashing during fluctuating load |

## Production-Ready HPA Example

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 65
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
```

:::tip
Scale up aggressively, scale down conservatively. The cost of over-provisioning for a few minutes is far less than the cost of dropping requests.
:::

## Custom Metrics: When CPU Is Not Enough

CPU-based scaling is table stakes. Production workloads need custom metrics:

- **Queue depth** -- scale workers based on pending messages
- **Request latency** -- scale when p95 latency exceeds SLO
- **Active connections** -- scale WebSocket or gRPC services
- **Business metrics** -- orders per minute, active sessions

Use Prometheus Adapter or KEDA to expose custom metrics to HPA.

## Common Mistakes

**Setting min = max replicas.** This disables autoscaling entirely. If you want a fixed count, just set `replicas` on the Deployment and skip HPA.

**Not setting resource requests.** Without requests, HPA has no baseline to calculate utilization. It will not scale at all. Every container must have CPU and memory requests.

**Targeting 90%+ utilization.** By the time you hit 90%, new pods take 30-60 seconds to become ready. Your existing pods are saturated and dropping requests during that window.

**Ignoring scale-down behavior.** Default scale-down is aggressive. A brief dip in traffic can trigger scale-down, and when traffic returns, you wait for new pods to start. Set stabilization to at least 5 minutes.

**Using HPA with VPA on the same metric.** HPA and Vertical Pod Autoscaler fight each other if both target CPU. Use VPA for memory only if you need both.

## Verifying HPA Status

```bash
kubectl get hpa api-hpa
kubectl describe hpa api-hpa
# Check if metrics are being collected
kubectl top pods -l app=api-server
```

## Decision: When to Use HPA vs Alternatives

| Scenario | Use |
|----------|-----|
| Steady traffic with predictable patterns | HPA on CPU |
| API with SLO targets | HPA on latency custom metric |
| Queue-based workers | KEDA (scale to zero) |
| Batch jobs triggered by events | KEDA |
| Sudden unpredictable bursts | HPA + Cluster Autoscaler |

## Resources

- [AKS HPA Walkthrough](https://learn.microsoft.com/en-us/azure/aks/tutorial-kubernetes-scale#autoscale-pods)
- [HPA Algorithm Details](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/#algorithm-details)
- [Scaling Best Practices](https://learn.microsoft.com/en-us/azure/aks/best-practices-performance-scale)
