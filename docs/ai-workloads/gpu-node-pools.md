---
sidebar_position: 1
title: "GPU Node Pools"
description: "Provisioning and managing GPU nodes in AKS for ML/AI workloads"
---

# GPU Node Pools

GPUs are expensive. Configure them correctly, scale to zero when idle, and use spot instances for training jobs that can checkpoint.

## GPU VM Families

| Series | GPU | VRAM | Use Case | Opinion |
|--------|-----|------|----------|---------|
| NC A100 v4 | A100 | 80 GB | Most ML/AI workloads | Default choice for inference and fine-tuning |
| ND H100 v5 | H100 | 80 GB | Large model training | When A100 isn't enough (100B+ param models) |
| NC T4 v3 | T4 | 16 GB | Light inference, dev/test | Budget option, good for testing |
| NV v3 | M60 | 8 GB | Visualization only | Not for ML/AI |

:::tip Opinion

Use `Standard_NC24ads_A100_v4` for most ML/AI workloads. It handles inference, fine-tuning, and moderate training. Only move to ND H100 for large-scale distributed training. Use NC T4 for dev/test and light inference where cost matters more than throughput.
:::

## Creating a GPU Node Pool

```bash
# Add GPU node pool with autoscaling (scales to 0 when idle)
az aks nodepool add \
  --resource-group myrg \
  --cluster-name myaks \
  --name gpua100 \
  --node-vm-size Standard_NC24ads_A100_v4 \
  --node-count 0 \
  --min-count 0 \
  --max-count 4 \
  --enable-cluster-autoscaler \
  --node-taints "sku=gpu:NoSchedule" \
  --labels workload=gpu \
  --zones 1 2 3
```

:::warning

Always taint GPU nodes with `NoSchedule`. Without taints, the scheduler will place regular workloads on your expensive GPU nodes. The taint ensures only pods with matching tolerations land there.
:::

## NVIDIA Device Plugin

AKS automatically installs the NVIDIA device plugin on GPU nodes. You don't need to install it manually. It exposes `nvidia.com/gpu` as a schedulable resource.

## Requesting GPU in Pod Spec

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: gpu-inference
spec:
  tolerations:
    - key: "sku"
      operator: "Equal"
      value: "gpu"
      effect: "NoSchedule"
  containers:
    - name: model-server
      image: myacr.azurecr.io/inference-server:latest
      resources:
        limits:
          nvidia.com/gpu: 1
      env:
        - name: NVIDIA_VISIBLE_DEVICES
          value: "all"
  nodeSelector:
    workload: gpu
```

:::info

GPUs cannot be shared between containers natively. If you request `nvidia.com/gpu: 1`, you get a whole GPU. For sharing, look at NVIDIA MIG (Multi-Instance GPU) or time-slicing -- covered in [Inference Serving](./inference-serving).
:::

## Spot Instances for GPU

Use spot for training jobs that can checkpoint. Never use spot for inference serving.

```bash
# Spot GPU pool -- saves 60-90% but can be evicted
az aks nodepool add \
  --resource-group myrg \
  --cluster-name myaks \
  --name gpuspot \
  --node-vm-size Standard_NC24ads_A100_v4 \
  --priority Spot \
  --eviction-policy Delete \
  --spot-max-price -1 \
  --min-count 0 \
  --max-count 8 \
  --enable-cluster-autoscaler \
  --node-taints "kubernetes.azure.com/scalesetpriority=spot:NoSchedule" \
  --labels workload=gpu-spot
```

| Workload | Use Spot? | Why |
|----------|-----------|-----|
| Model training (with checkpointing) | Yes | Save 60-90%, restart from checkpoint on eviction |
| Batch inference (non-realtime) | Yes | Re-queue failed batches |
| Real-time inference serving | No | Eviction causes user-facing downtime |
| Fine-tuning (hours-long) | Yes, with checkpoints | Save significantly on long jobs |

## Cost Management

GPUs are 5-10x more expensive than general compute. Manage costs aggressively:

1. **Scale to zero**: Set `--min-count 0` on GPU pools. The autoscaler removes nodes when no GPU pods are pending.
2. **Use spot for training**: 60-90% cheaper for interruptible work.
3. **Right-size GPU requests**: Don't request 4 GPUs when 1 suffices. Each unused GPU wastes $2-10/hour.
4. **Schedule training off-peak**: Spot availability is higher during off-peak hours.

```bash
# Check current GPU utilization before adding capacity
kubectl top pods -l workload=gpu --containers
```

## Common Mistakes

1. **Not tainting GPU nodes** -- Regular pods fill expensive GPU nodes.
2. **Setting min-count > 0 for intermittent workloads** -- Paying for idle GPUs 24/7.
3. **Using spot for production inference** -- Users get errors when nodes are evicted.
4. **Forgetting availability zones** -- GPU SKUs have limited zone availability. Check first.

## Resources

- [GPU clusters on AKS](https://learn.microsoft.com/azure/aks/gpu-cluster)
- [Use spot node pools](https://learn.microsoft.com/azure/aks/spot-node-pool)
- [NVIDIA GPU Operator](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/)
