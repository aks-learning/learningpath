---
sidebar_position: 2
title: "Deployment Strategies"
description: "Rolling updates, blue/green, and canary deployments on AKS with opinionated guidance on when to use each."
---

# Deployment Strategies

Most teams overcomplicate this. Use rolling updates as your default. Add canary for the two or three services where a bad deploy costs real money. Skip blue/green unless you have a very specific reason.

## Decision Table

| Strategy | Complexity | Resource cost | Rollback speed | Best for |
|----------|-----------|---------------|----------------|----------|
| Rolling update | Low | 1x + surge | Slow (re-deploy) | 90% of workloads |
| Canary | Medium | 1x + small % | Fast (shift traffic) | User-facing critical services |
| Blue/Green | High | 2x | Instant (swap) | Stateful apps, databases, compliance-heavy |

:::tip
Use rolling updates as your default. Add canary for critical user-facing services where you need to validate with real traffic before full rollout. Blue/green is expensive (2x resources permanently) and rarely needed in Kubernetes -- the platform already gives you declarative rollbacks.
:::

## Rolling Update (Default)

Rolling updates gradually replace old pods with new ones. Kubernetes handles this natively with zero configuration beyond your Deployment spec.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # Create 1 extra pod during rollout
      maxUnavailable: 0    # Never have fewer than 4 ready pods
  progressDeadlineSeconds: 300  # Fail the rollout if stuck for 5 min
  template:
    spec:
      containers:
        - name: myapp
          image: myacr.azurecr.io/myapp:v2.1.0
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
```

:::warning
Always set `maxUnavailable: 0` for production services. The default of 25% means Kubernetes will kill pods before new ones are ready. Combined with `maxSurge: 1`, you get zero-downtime deploys that are slightly slower but never drop requests.
:::

**Critical settings people forget:**

- `progressDeadlineSeconds`: Without this, a broken deployment hangs forever. Set it to 300-600 seconds.
- `readinessProbe`: Without this, Kubernetes routes traffic to pods that are not ready. Every deployment without a readiness probe is a potential outage.
- `minReadySeconds`: Add 10-30 seconds to catch pods that crash shortly after starting.

## Canary Deployments

Canary sends a small percentage of traffic to the new version. You watch error rates and latency, then either promote or roll back. Do not implement this manually with multiple Deployments and service selectors -- use a proper tool.

:::tip
If you need canary, use Argo Rollouts. It is mature, well-documented, and works with any service mesh or ingress controller. Flagger is the CNCF alternative but has a smaller community and less intuitive configuration.
:::

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: myapp
spec:
  replicas: 5
  strategy:
    canary:
      steps:
        - setWeight: 10     # Send 10% of traffic to canary
        - pause: {duration: 5m}
        - setWeight: 30
        - pause: {duration: 5m}
        - setWeight: 60
        - pause: {duration: 5m}
      canaryMetadata:
        labels:
          role: canary
      trafficRouting:
        nginx:
          stableIngress: myapp-ingress
  template:
    spec:
      containers:
        - name: myapp
          image: myacr.azurecr.io/myapp:v2.1.0
```

Argo Rollouts integrates with Prometheus for automated analysis. If error rate exceeds threshold during any pause step, it rolls back automatically:

```yaml
      analysis:
        templates:
          - templateName: error-rate
        startingStep: 1    # Start checking after first weight shift
```

## Blue/Green

Two full environments running simultaneously. Traffic switches instantly between them. This is expensive and usually unnecessary in Kubernetes.

**When blue/green actually makes sense:**
- Database schema migrations that cannot be rolled back
- Compliance environments requiring full pre-production validation
- Stateful services where rolling updates cause session issues

For everything else, rolling updates or canary are cheaper and simpler.

## Common Mistakes

- No readiness probes: Kubernetes sends traffic to unready pods during rollout. Every time.
- No progress deadline: Broken deployments hang indefinitely, blocking the next deploy.
- Manual canary with label selectors: Fragile, error-prone, and gives you no automated rollback.
- Skipping `minReadySeconds`: Pods that crash after 3 seconds look healthy during rollout.
- Blue/green for stateless services: You are paying for 2x compute for an instant rollback you could get with `kubectl rollout undo`.

## Rollback

Rolling updates support native rollback:

```bash
# Immediate rollback to previous revision
kubectl rollout undo deployment/myapp

# Check rollout history
kubectl rollout history deployment/myapp

# Rollback to specific revision
kubectl rollout undo deployment/myapp --to-revision=3
```

:::info
Kubernetes keeps 10 revisions by default (`revisionHistoryLimit`). Do not set this to 0 -- you lose the ability to rollback. Keep at least 5.
:::

## Resources

- [Kubernetes Deployment Strategies](https://learn.microsoft.com/en-us/azure/aks/concepts-clusters-workloads#deployments-and-yaml-manifests)
- [Argo Rollouts Documentation](https://argoproj.github.io/argo-rollouts/)
- [Flagger Progressive Delivery](https://flagger.app/)
- [Pod Disruption Budgets](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
