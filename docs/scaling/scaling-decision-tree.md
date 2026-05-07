---
sidebar_position: 5
title: "Scaling decision tree"
description: "Choose the right autoscaling strategy: HPA, VPA, KEDA, Cluster Autoscaler, or Node Autoprovision. Decision tree for every workload type."
---

# Scaling decision tree

AKS has five scaling mechanisms. Using the wrong one (or the wrong combination) wastes money or drops requests. This page tells you which ones to enable for each workload type.

## The five scalers at a glance

| Scaler | What it scales | Trigger | Scale to zero | Managed add-on |
|--------|---------------|---------|---------------|----------------|
| **HPA** | Pod replicas | CPU, memory, custom metrics | No | Built-in (Kubernetes) |
| **VPA** | Pod resource requests | Historical usage | No | AKS add-on |
| **KEDA** | Pod replicas | External events (queues, cron, HTTP, Prometheus) | Yes | AKS add-on |
| **Cluster Autoscaler (CA)** | Nodes in a node pool | Unschedulable pods / underutilized nodes | No (min-count >= 1 for system pools) | Built-in |
| **Node Autoprovision (NAP)** | Node pools + nodes | Unschedulable pods (picks VM SKU automatically) | Yes (entire pool) | AKS Automatic |

:::tip

Pod autoscalers (HPA, VPA, KEDA) decide how many pods you need. Node autoscalers (CA, NAP) ensure those pods have somewhere to run. Always pair a pod autoscaler with a node autoscaler.

:::

## Decision tree by workload type

### 1. Web APIs and HTTP services

Steady traffic with request-driven scaling. CPU and latency are your primary signals.

**Use: HPA (CPU/memory or custom metrics) + Cluster Autoscaler**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-api
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
```

Why not KEDA? KEDA adds complexity when simple CPU-based scaling works. Web APIs rarely need scale-to-zero because they handle live traffic. Save KEDA for event-driven workloads.

### 2. Event-driven and queue processors

Workers consuming from Service Bus, Storage Queues, Kafka, or Event Hubs. Traffic is bursty and the workload should idle when the queue is empty.

**Use: KEDA + Cluster Autoscaler**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: queue-worker-scaler
spec:
  scaleTargetRef:
    name: queue-worker
  pollingInterval: 15
  cooldownPeriod: 300
  minReplicaCount: 0
  maxReplicaCount: 50
  triggers:
    - type: azure-servicebus
      authenticationRef:
        name: servicebus-workload-identity
      metadata:
        queueName: orders
        messageCount: "5"
```

Why not HPA? HPA cannot scale to zero. If your queue processor sits idle 18 hours a day, HPA keeps at least `minReplicas` pods running and burning compute. KEDA scales to zero and wakes up when messages arrive.

### 3. Batch and cron jobs

Scheduled workloads that run at specific times or intervals: nightly ETL, report generation, data aggregation.

**Use: KEDA (cron trigger) + Cluster Autoscaler with min-count 0 on the batch pool**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: nightly-etl-scaler
spec:
  scaleTargetRef:
    name: etl-worker
  minReplicaCount: 0
  maxReplicaCount: 10
  triggers:
    - type: cron
      metadata:
        timezone: America/Chicago
        start: "0 2 * * *"
        end: "0 5 * * *"
        desiredReplicas: "10"
```

```bash
# Dedicated batch node pool that scales to zero
az aks nodepool add \
  --resource-group myrg \
  --cluster-name myaks \
  --name batch \
  --node-vm-size Standard_D8s_v5 \
  --enable-cluster-autoscaler \
  --min-count 0 \
  --max-count 5 \
  --labels workload=batch \
  --node-taints batch=true:NoSchedule
```

Use node taints and tolerations to ensure batch pods land on the batch pool. When KEDA scales the deployment to zero, CA removes the idle batch nodes and you pay nothing.

### 4. AI/ML inference

GPU workloads with custom metric signals (queue depth, request latency, GPU utilization).

**Use: KEDA or HPA (custom metrics) + Cluster Autoscaler on a GPU node pool**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: inference-scaler
spec:
  scaleTargetRef:
    name: model-server
  minReplicaCount: 1
  maxReplicaCount: 8
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus-server.monitoring.svc:9090
        query: sum(rate(inference_requests_total{service="model-server"}[2m]))
        threshold: "100"
```

```bash
# GPU node pool with autoscaler
az aks nodepool add \
  --resource-group myrg \
  --cluster-name myaks \
  --name gpu \
  --node-vm-size Standard_NC6s_v3 \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 4 \
  --node-taints sku=gpu:NoSchedule \
  --labels workload=gpu
```

:::warning

GPU nodes take 5-10 minutes to provision and become ready. Do not rely on reactive scaling alone for latency-sensitive inference. Keep `minReplicaCount` at 1 or higher to absorb initial requests while new nodes start.

:::

### 5. Mixed workloads

Most production clusters run a combination of APIs, workers, and batch jobs. Separate them onto dedicated node pools and apply the right scaler to each.

| Workload | Node pool | Pod scaler | Node scaler |
|----------|-----------|------------|-------------|
| Web APIs | `general` (D-series) | HPA (CPU) | CA min=2 |
| Queue workers | `general` (D-series) | KEDA (queue depth) | CA min=2 |
| Batch ETL | `batch` (D-series) | KEDA (cron) | CA min=0 |
| ML inference | `gpu` (NC-series) | KEDA (Prometheus) | CA min=1 |

This separation prevents GPU workloads from competing with API pods for resources and lets you scale each pool independently.

## Combination rules

### Always enable Cluster Autoscaler alongside pod autoscalers

HPA or KEDA without CA means pods scale up but have nowhere to run. They sit in Pending state until you manually add nodes. This defeats the purpose of autoscaling.

```bash
# Every node pool should have CA enabled
az aks nodepool update \
  --resource-group myrg \
  --cluster-name myaks \
  --name general \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 20
```

### VPA and HPA on CPU conflict -- use VPA for memory only with HPA

VPA adjusts resource requests. HPA scales based on resource utilization (which is calculated against requests). If both target CPU, they fight: VPA raises requests, utilization drops, HPA scales down. HPA adds replicas, utilization drops, VPA lowers requests. This loop never stabilizes.

The safe combination:

- **HPA**: scales on CPU utilization
- **VPA**: adjusts memory requests only (set `updatePolicy` to target memory, not CPU)

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-api
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
      - containerName: "*"
        controlledResources: ["memory"]
        minAllowed:
          memory: "128Mi"
        maxAllowed:
          memory: "2Gi"
```

:::info

If you only need right-sizing recommendations without automatic changes, set VPA `updateMode` to `Off`. It still collects data and shows recommendations via `kubectl describe vpa`. Use this to inform your initial resource requests.

:::

### KEDA and HPA are complementary, not competing

KEDA creates HPA resources under the hood once replicas are above zero. Do not create a separate HPA for the same Deployment that KEDA manages -- they will conflict on `desiredReplicas`.

## Common mistakes

**HPA without Cluster Autoscaler.** HPA scales pods from 3 to 20. Your cluster has capacity for 12. Pods 13-20 sit Pending. Enable CA on every node pool.

**KEDA with scale-to-zero but no Cluster Autoscaler.** KEDA scales pods to zero, but the nodes stay allocated and billing. CA is what removes the idle nodes. Without it, you pay for empty VMs.

**VPA and HPA both targeting CPU.** They oscillate. VPA raises CPU requests, HPA sees lower utilization and scales down, VPA lowers requests, HPA sees higher utilization and scales up. Use VPA for memory only when HPA is active.

**maxReplicas set too low.** You set maxReplicas to 10 "because that should be enough." Black Friday arrives, HPA hits the ceiling, requests start failing. Set maxReplicas based on your peak load estimate plus 50% headroom.

**HPA target utilization at 90%.** By the time pods hit 90% CPU, new pods take 30-60 seconds to start. During that window, existing pods are saturated. Target 60-70% to leave room for traffic spikes during scale-up.

**Not right-sizing resource requests.** HPA calculates utilization as `actual usage / requests`. If you request 1 CPU but use 100m, HPA sees 10% and never scales up. Run VPA in recommendation mode first to get accurate request values.

**Forgetting PodDisruptionBudgets.** When CA removes a node, it evicts pods. Without a PDB, all replicas on that node can terminate at once. Always set `minAvailable` or `maxUnavailable`.

## Right-sizing with VPA recommendation mode

Before tuning HPA targets, you need accurate resource requests. Run VPA in recommendation mode for 24-48 hours on each workload:

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-vpa-recommender
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-api
  updatePolicy:
    updateMode: "Off"
```

```bash
# After 24-48 hours, check recommendations
kubectl describe vpa api-vpa-recommender

# Look for the "Target" values under Container Recommendations
# Use these as your Deployment resource requests
```

Then set your Deployment requests to the VPA-recommended values and configure HPA around those accurate baselines.

## Anti-patterns

**"We set replicas: 10 and never touch it."** Static replica counts guarantee waste during low traffic and failures during high traffic. There is no replica count that is correct 24/7.

**"We use KEDA for everything, even steady-state APIs."** KEDA adds polling overhead and complexity. For workloads that always have traffic and never need to scale to zero, plain HPA is simpler and has lower latency.

**"We run one node pool with autoscaler disabled."** When pod autoscalers create demand, nothing provisions new nodes. You are capped at whatever nodes you provisioned at cluster creation.

**"We scale up fast and scale down fast."** Fast scale-down causes thrashing. Traffic dips for 2 minutes, CA removes a node, traffic returns, CA adds a node (which takes 3-4 minutes). Set `scale-down-unneeded-time` to at least 10 minutes.

## Resources

- [HPA on AKS](https://learn.microsoft.com/en-us/azure/aks/tutorial-kubernetes-scale#autoscale-pods)
- [Cluster Autoscaler](https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler-overview)
- [Node Autoprovision](https://learn.microsoft.com/en-us/azure/aks/node-autoprovision)
- [KEDA AKS add-on](https://learn.microsoft.com/en-us/azure/aks/keda-about)
- [VPA on AKS](https://learn.microsoft.com/en-us/azure/aks/vertical-pod-autoscaler)
- [Scaling best practices](https://learn.microsoft.com/en-us/azure/aks/best-practices-performance-scale)

---

**Next**: [Virtual Nodes](./virtual-nodes) -- serverless burst scaling for extreme elasticity.
