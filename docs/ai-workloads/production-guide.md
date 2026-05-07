---
sidebar_position: 4
title: "AI/ML production guide"
description: "Run AI inference workloads on AKS at production scale: GPU node pool strategy, model caching, autoscaling, cost controls, and multi-model serving."
---

# AI/ML production guide

Running a GPU node pool for experiments is easy. Running AI inference at production scale on AKS without burning your budget requires careful architecture decisions. This guide covers what matters.

## GPU node pool strategy

### SKU selection

Pick the GPU family based on the workload, not the one with the most VRAM.

| Series | Best for | GPU | VRAM | Use when |
|--------|----------|-----|------|----------|
| NC-series (T4) | Training, fine-tuning | NVIDIA T4 | 16 GB | You need cost-effective training or small model inference |
| NC A100 | Large model training | NVIDIA A100 | 80 GB | You are training models that need high memory bandwidth |
| ND-series (H100) | Large model inference | NVIDIA H100 | 80 GB | You are serving 70B+ parameter models in production |
| NV-series (A10) | Visualization, light inference | NVIDIA A10 | 24 GB | You need rendering or models under 13B parameters |

:::warning

Do not default to ND-series H100 nodes. They cost 10-30x more than NC T4 nodes. A 7B parameter model runs fine on a single T4. Right-size first, upgrade later.

:::

### Spot GPU pools for non-critical work

Use spot instances for batch inference, evaluation jobs, and development workloads. Do not use spot for real-time inference serving that has latency SLAs.

```bash
az aks nodepool add \
  --resource-group myResourceGroup \
  --cluster-name myAKSCluster \
  --name gpuspot \
  --node-count 1 \
  --node-vm-size Standard_NC6s_v3 \
  --priority Spot \
  --eviction-policy Delete \
  --spot-max-price -1 \
  --labels workload-type=batch-gpu
```

### Taints and tolerations

Always taint GPU node pools. Without taints, the scheduler will place CPU workloads on expensive GPU nodes.

```bash
az aks nodepool add \
  --resource-group myResourceGroup \
  --cluster-name myAKSCluster \
  --name gpupool \
  --node-count 1 \
  --node-vm-size Standard_NC6s_v3 \
  --node-taints sku=gpu:NoSchedule \
  --labels sku=gpu
```

Add the matching toleration to every GPU workload:

```yaml
tolerations:
  - key: "sku"
    operator: "Equal"
    value: "gpu"
    effect: "NoSchedule"
resources:
  limits:
    nvidia.com/gpu: 1
```

### Scale-to-zero for cost savings

GPU nodes sitting idle cost the same as GPU nodes under load. Use KEDA with a minimum node count of zero to eliminate idle spend.

```bash
az aks nodepool add \
  --resource-group myResourceGroup \
  --cluster-name myAKSCluster \
  --name gpuondemand \
  --node-count 0 \
  --min-count 0 \
  --max-count 4 \
  --enable-cluster-autoscaler \
  --node-vm-size Standard_NC6s_v3 \
  --node-taints sku=gpu:NoSchedule
```

:::info

GPU nodes take 5-10 minutes to provision and become ready. Factor this cold-start time into your scaling strategy. For latency-sensitive workloads, keep at least one warm node.

:::

## Model serving options

### Decision table

Pick one and commit. Do not build a custom serving layer unless you have a team to maintain it.

| Option | Best for | Complexity | Multi-model | Custom models |
|--------|----------|------------|-------------|---------------|
| KAITO | Popular open-source models | Low | No | Limited |
| vLLM | High-throughput LLM inference | Medium | Yes | Yes |
| Text Generation Inference (TGI) | HuggingFace models | Medium | No | Yes |
| Triton Inference Server | Multi-framework, non-LLM models | High | Yes | Yes |

### KAITO

Use KAITO when you want to deploy a supported model with minimal configuration. KAITO handles GPU node provisioning, model download, and serving automatically.

```yaml
apiVersion: kaito.sh/v1alpha1
kind: Workspace
metadata:
  name: llama-3-8b
spec:
  resource:
    instanceType: Standard_NC24ads_A100_v4
    labelSelector:
      matchLabels:
        apps: llama-3-8b
  inference:
    preset:
      name: llama-3-8b-instruct
```

:::tip

Start with KAITO for your first deployment. Move to vLLM or Triton only when you hit KAITO's limitations: custom model weights, advanced batching, or multi-model serving on a single GPU.

:::

### vLLM on AKS

Use vLLM when you need high throughput, continuous batching, or model multiplexing. Deploy it as a standard Kubernetes deployment.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vllm
  template:
    metadata:
      labels:
        app: vllm
    spec:
      tolerations:
        - key: "sku"
          operator: "Equal"
          value: "gpu"
          effect: "NoSchedule"
      containers:
        - name: vllm
          image: vllm/vllm-openai:latest
          args: ["--model", "meta-llama/Llama-3-8B-Instruct",
                 "--max-model-len", "4096",
                 "--gpu-memory-utilization", "0.9"]
          resources:
            limits:
              nvidia.com/gpu: 1
          ports:
            - containerPort: 8000
          volumeMounts:
            - name: model-cache
              mountPath: /root/.cache/huggingface
      volumes:
        - name: model-cache
          persistentVolumeClaim:
            claimName: model-cache-pvc
```

## Model caching and storage

Loading a 16 GB model from the internet on every pod startup is the most common mistake in production AI on Kubernetes.

### Azure files NFS for shared model weights

Use Azure Files with NFS for models that multiple pods need to access simultaneously. This avoids downloading the same model for each replica.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: model-cache-pvc
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: azurefile-csi-nfs
  resources:
    requests:
      storage: 100Gi
```

### Init containers for model download

Use an init container to pull model weights from Azure Blob Storage before the inference server starts. This separates the download step from the serving container.

```yaml
initContainers:
  - name: model-downloader
    image: mcr.microsoft.com/azure-cli:latest
    command:
      - bash
      - -c
      - |
        az storage blob download-batch \
          --destination /models \
          --source model-weights \
          --account-name mystorageaccount \
          --auth-mode login
    volumeMounts:
      - name: model-volume
        mountPath: /models
```

### Local NVMe caching on GPU VMs

GPU VM SKUs with local NVMe (NC A100 v4, ND H100 v5) offer fast local storage. Use it as a cache layer for hot models. Mount the local disk and copy models there on first access.

:::tip

Combine Azure Files NFS as the source of truth with local NVMe as a read-through cache. The NFS share holds all models; each node copies only the models it needs to local NVMe at pod startup.

:::

### Avoid image-based models at scale

Baking model weights into the container image means slow pulls, high registry egress costs, and long node startup times. Only use this for models under 2 GB.

## Autoscaling AI workloads

### KEDA with Prometheus metrics

KEDA is the best option for scaling AI inference on AKS. Use Prometheus metrics from your inference server as the scaling trigger.

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: vllm-scaler
spec:
  scaleTargetRef:
    name: vllm-server
  minReplicaCount: 1
  maxReplicaCount: 8
  cooldownPeriod: 300
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus-server.monitoring:9090
        metricName: vllm_pending_requests
        query: sum(vllm:num_requests_waiting)
        threshold: "10"
```

Key metrics to scale on:

| Metric | Scale when | Why |
|--------|-----------|-----|
| Queue depth / pending requests | Requests waiting > threshold | Directly measures demand backlog |
| GPU utilization | Sustained > 80% | Indicates compute saturation |
| Request latency (p95) | Exceeds SLA target | Catches degradation before users notice |
| Batch size | Consistently at max | Means the server cannot keep up |

### HPA with custom metrics

If you are not using KEDA, configure HPA with custom metrics from the Prometheus adapter. KEDA is preferred because it supports scale-to-zero.

### Scale-to-zero during off-hours

```yaml
spec:
  minReplicaCount: 0
  triggers:
    - type: cron
      metadata:
        timezone: America/Los_Angeles
        start: 0 8 * * 1-5
        end: 0 20 * * 1-5
        desiredReplicas: "1"
```

### Node autoscaler considerations

The cluster autoscaler provisions GPU nodes when pods are pending. Expect 5-10 minutes for a GPU node to become schedulable. Use pod priority classes so critical inference pods get scheduled first, and consider overprovisioning by one node during peak hours.

## Cost controls

GPU compute is the largest cost driver in AI workloads. Every optimization here has a direct dollar impact.

### Spot instances for batch inference

Use spot GPU pools for any workload that can tolerate interruption: batch scoring, model evaluation, offline embedding generation. Spot GPU VMs cost 60-90% less than on-demand.

### Reserved instances for steady-state

If you run production inference 24/7, buy a 1-year or 3-year reservation. Savings range from 30-60% over pay-as-you-go.

### Cluster stop/start for dev/test

Stop GPU clusters when not in use. A single Standard_NC6s_v3 costs roughly $2,700/month. Stopping outside working hours saves up to 65%.

```bash
# Stop the cluster (deallocates all nodes)
az aks stop --resource-group myResourceGroup --name myDevGPUCluster

# Start the cluster
az aks start --resource-group myResourceGroup --name myDevGPUCluster
```

### Right-sizing GPU SKUs

Do not use an A100 to serve a 7B parameter model. Match the GPU to the model size.

| Model size | Recommended GPU | VRAM needed |
|-----------|-----------------|-------------|
| < 3B parameters | T4 (16 GB) | 6-8 GB |
| 7-8B parameters | T4 (16 GB) or A10 (24 GB) | 14-16 GB |
| 13B parameters | A10 (24 GB) | 24 GB |
| 30-34B parameters | A100 (80 GB) | 60-70 GB |
| 70B+ parameters | 2x A100 or H100 | 140+ GB |

:::warning

Quantized models (GPTQ, AWQ, GGUF) use significantly less VRAM. A 70B model quantized to 4-bit fits on a single A100. Always check quantized model sizes before selecting your GPU SKU.

:::

### Budget alerts

Set budget alerts on the resource group containing GPU nodes. GPU spend escalates quickly if autoscaling is misconfigured.

## Multi-model serving

### Model multiplexing on a single GPU

vLLM supports serving multiple LoRA adapters from a single base model. Use this for fine-tuned variants of the same base model.

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3-8B-Instruct \
  --enable-lora \
  --lora-modules customer-a=/models/lora-a customer-b=/models/lora-b \
  --max-loras 4
```

### Separate deployments per model

When models have different architectures or GPU requirements, deploy them as separate Kubernetes deployments with independent scaling policies.

### A/B model routing via ingress

Use ingress rules to route traffic between model versions for canary deployments and gradual rollouts. Set `nginx.ingress.kubernetes.io/canary-weight` to control the traffic split between model versions.

## Common mistakes

| Mistake | Why it hurts | Fix |
|---------|-------------|-----|
| Oversized GPU SKUs | Paying for VRAM you do not use | Profile model memory usage, pick the smallest SKU that fits |
| No autoscaling on GPU pools | Idle GPUs cost the same as busy ones | Use KEDA with scale-to-zero for non-critical workloads |
| Loading models from the internet at startup | Adds 5-15 minutes to every pod start | Cache models on Azure Files NFS or local NVMe |
| No taints on GPU node pools | CPU workloads land on GPU nodes | Taint all GPU pools with `sku=gpu:NoSchedule` |
| GPU idle during low traffic | Wasting money on powered-on GPUs with no requests | Scale-to-zero with KEDA or stop dev clusters |
| Baking large models into container images | Slow image pulls, high registry costs | Use volume mounts with shared storage |
| Single replica with no health checks | One crash takes down inference | Run at least 2 replicas with liveness and readiness probes |

## Resources

- [Use GPUs on AKS](https://learn.microsoft.com/azure/aks/gpu-cluster)
- [KAITO on AKS](https://learn.microsoft.com/azure/aks/ai-toolchain-operator)
- [KEDA autoscaling on AKS](https://learn.microsoft.com/azure/aks/keda-about)
- [AKS cluster autoscaler](https://learn.microsoft.com/azure/aks/cluster-autoscaler)
- [Spot node pools on AKS](https://learn.microsoft.com/azure/aks/spot-node-pool)
- [Azure Files NFS on AKS](https://learn.microsoft.com/azure/aks/azure-files-csi)
- [GPU VM sizes in Azure](https://learn.microsoft.com/azure/virtual-machines/sizes-gpu)
- [Azure savings plans and reservations](https://learn.microsoft.com/azure/cost-management-billing/savings-plan/savings-plan-compute-overview)
