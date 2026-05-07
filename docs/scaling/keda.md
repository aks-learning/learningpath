---
sidebar_position: 3
title: "KEDA: Event-Driven Autoscaling"
description: "Scale workloads from zero to N based on external events. Queues, HTTP, cron, and custom triggers."
---

# KEDA: Event-Driven Autoscaling

Use KEDA for any workload driven by external events. HPA alone cannot scale to zero or react to queue depth. KEDA fills that gap and is the correct choice for event-driven architectures.

## What KEDA Does

KEDA (Kubernetes Event-Driven Autoscaling) watches external event sources and scales your workloads accordingly:

- **Zero to one**: Activates idle deployments when events arrive
- **One to N**: Scales based on event backlog (works alongside HPA)
- **N to zero**: Deactivates deployments when the event source is empty

:::info

KEDA is built into AKS as a managed add-on. Do not install it manually with Helm. Enable the add-on and let AKS manage upgrades and availability.
:::

## Enabling KEDA on AKS

```bash
# Enable the KEDA add-on
az aks update \
  --resource-group myRG \
  --name myAKS \
  --enable-keda

# Verify it is running
kubectl get pods -n kube-system -l app=keda-operator
```

## Core Concept: ScaledObject

A `ScaledObject` maps an event source to a Deployment and defines how to scale:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-processor-scaler
spec:
  scaleTargetRef:
    name: order-processor
  pollingInterval: 15
  cooldownPeriod: 120
  minReplicaCount: 0
  maxReplicaCount: 30
  triggers:
  - type: azure-servicebus
    metadata:
      queueName: orders
      messageCount: "5"
      connectionFromEnv: SERVICEBUS_CONNECTION
```

This tells KEDA: scale the `order-processor` deployment so there is roughly 1 replica per 5 messages in the queue. When the queue is empty, scale to zero.

## Key Scalers for AKS Workloads

| Scaler | Use Case | Trigger |
|--------|----------|---------|
| `azure-servicebus` | Message processing workers | Queue/topic message count |
| `azure-queue` | Storage Queue consumers | Queue length |
| `kafka` | Stream processing | Consumer group lag |
| `prometheus` | Metric-based (custom) | PromQL query result |
| `cron` | Scheduled scaling | Time-based schedule |
| `http` | HTTP workloads | Request rate (KEDA HTTP add-on) |

## KEDA + HPA: Complementary, Not Competing

:::tip

KEDA and HPA are complementary. Use KEDA for scale-to-zero and event-driven triggers. Use HPA for CPU/memory-based steady-state scaling. KEDA actually creates HPA resources under the hood once replicas are above zero.
:::

A common pattern:

- KEDA watches a queue and scales 0 to 1 when messages arrive
- Once running, HPA takes over for CPU-based scaling from 1 to N
- When the queue drains and CPU drops, KEDA scales back to 0

## Production Example: Service Bus with Workload Identity

```yaml
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: servicebus-auth
spec:
  podIdentity:
    provider: azure-workload
    identityId: <managed-identity-client-id>
---
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: invoice-worker-scaler
spec:
  scaleTargetRef:
    name: invoice-worker
  pollingInterval: 10
  cooldownPeriod: 300
  minReplicaCount: 0
  maxReplicaCount: 50
  triggers:
  - type: azure-servicebus
    authenticationRef:
      name: servicebus-auth
    metadata:
      namespace: invoicing
      queueName: pending-invoices
      messageCount: "10"
```

:::warning

Use Workload Identity for authentication in production. Connection strings in environment variables are a security liability. KEDA supports `podIdentity` natively on AKS.
:::

## Common Mistakes

**Setting pollingInterval too low.** A 1-second polling interval against Azure Service Bus will hit API rate limits. Use 10-30 seconds for most sources. The queue is not going anywhere.

**Not setting cooldownPeriod.** Without a cooldown, KEDA scales to zero the instant the queue is empty. If messages arrive in bursts, you pay cold-start latency on every burst. Set cooldown to 2-5 minutes.

**Ignoring maxReplicaCount.** A sudden flood of 100,000 messages will try to create thousands of pods. Set a sane maximum based on your cluster capacity and downstream dependencies.

**Using KEDA for steady-state HTTP traffic.** If your service always has traffic, HPA on CPU is simpler and has less overhead. KEDA shines for bursty and event-driven workloads, not constant-load APIs.

**Forgetting to handle graceful shutdown.** When KEDA scales down, pods get terminated. If your worker does not handle SIGTERM and finish in-progress messages, you lose work. Implement graceful shutdown with `terminationGracePeriodSeconds`.

## Decision: When to Use KEDA

| Workload Pattern | Scaling Solution |
|-----------------|-----------------|
| Always-on API with variable load | HPA (CPU/latency) |
| Queue consumer that can idle | KEDA (queue depth) |
| Cron job that needs specific scale at specific times | KEDA (cron trigger) |
| Stream processor with lag sensitivity | KEDA (Kafka lag) |
| Workload that must scale to zero for cost | KEDA |
| Mixed: events + steady traffic | KEDA + HPA together |

## Resources

- [KEDA AKS Add-on](https://learn.microsoft.com/en-us/azure/aks/keda-about)
- [KEDA Scalers Catalog](https://keda.sh/docs/scalers/)
- [KEDA + Workload Identity](https://learn.microsoft.com/en-us/azure/aks/keda-workload-identity)
