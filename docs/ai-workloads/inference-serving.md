---
sidebar_position: 3
title: "Model Inference Serving"
description: "Production LLM serving on AKS -- KAITO, vLLM, TGI, and autoscaling strategies"
---

# Model Inference Serving

Start with KAITO for simplicity. Graduate to vLLM when you need to squeeze maximum throughput from expensive GPUs.

## Serving Framework Comparison

| Framework | Throughput | Ease of Setup | Best For |
|-----------|-----------|---------------|----------|
| **KAITO** | Good (default settings) | Trivial (1 YAML) | Getting started, standard models |
| **vLLM** | Highest (PagedAttention) | Medium (manual deploy) | Production LLM serving at scale |
| **TGI** | High | Medium | HuggingFace ecosystem models |
| **Triton** | High (multi-framework) | Complex | Multi-model, multi-framework serving |
| **Custom** | Varies | Hard | Proprietary models, special requirements |

:::tip Opinion

KAITO for simplicity. vLLM for maximum throughput on production LLM serving. This is the decision tree for 90% of teams.
:::

## vLLM on AKS

vLLM uses PagedAttention and continuous batching to achieve the highest tokens/second on GPU hardware. If you're serving LLMs at scale, this is the framework to use.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-llama2
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vllm-llama2
  template:
    metadata:
      labels:
        app: vllm-llama2
    spec:
      tolerations:
        - key: "sku"
          operator: "Equal"
          value: "gpu"
          effect: "NoSchedule"
      containers:
        - name: vllm
          image: vllm/vllm-openai:latest
          args:
            - "--model"
            - "meta-llama/Llama-2-7b-chat-hf"
            - "--tensor-parallel-size"
            - "1"
            - "--max-model-len"
            - "4096"
          resources:
            limits:
              nvidia.com/gpu: 1
          ports:
            - containerPort: 8000
          env:
            - name: HUGGING_FACE_HUB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: hf-token
                  key: token
      nodeSelector:
        workload: gpu
---
apiVersion: v1
kind: Service
metadata:
  name: vllm-llama2
spec:
  selector:
    app: vllm-llama2
  ports:
    - port: 8000
      targetPort: 8000
  type: ClusterIP
```

## Autoscaling Inference

Use KEDA with custom metrics to scale inference replicas based on actual demand.

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: vllm-scaler
spec:
  scaleTargetRef:
    name: vllm-llama2
  minReplicaCount: 1
  maxReplicaCount: 8
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus:9090
        metricName: vllm_pending_requests
        query: sum(vllm_num_requests_waiting)
        threshold: "10"
```

:::info

Scale on queue depth (pending requests), not GPU utilization. GPU utilization stays high even when throughput is fine. Queue depth tells you when users are actually waiting.
:::

## Multi-Model GPU Sharing

One GPU per model is wasteful for small models or low-traffic endpoints. Options:

| Strategy | How It Works | When to Use |
|----------|-------------|-------------|
| **Time-slicing** | Round-robin GPU access between containers | Multiple small models, acceptable latency |
| **MIG (Multi-Instance GPU)** | Physically partition A100 into independent slices | Isolation between models, A100/H100 only |
| **Multiple models in one process** | vLLM/Triton serve multiple models | Same framework, shared memory |

```yaml
# NVIDIA time-slicing configuration (ConfigMap)
apiVersion: v1
kind: ConfigMap
metadata:
  name: nvidia-device-plugin
  namespace: kube-system
data:
  config.yaml: |
    version: v1
    sharing:
      timeSlicing:
        resources:
          - name: nvidia.com/gpu
            replicas: 4
```

This makes each physical GPU appear as 4 schedulable GPUs. Pods share the GPU via time-slicing.

## Performance Optimization Checklist

1. **Enable continuous batching** -- vLLM does this by default. TGI needs `--max-batch-prefill-tokens`.
2. **Set appropriate max model length** -- Shorter context = more concurrent requests.
3. **Use quantization for inference** -- AWQ or GPTQ reduces memory, minimal quality loss.
4. **Tensor parallelism for large models** -- Split across GPUs when model doesn't fit in one.
5. **Preload models** -- Use init containers or PVCs with cached weights. Don't download on every pod start.

:::warning Common Mistake

Downloading model weights from HuggingFace on every pod restart. A 13B model is 26GB. Use a PVC with pre-downloaded weights or an init container that caches to a shared volume.
:::

## When to Graduate from KAITO to Custom

| Signal | Action |
|--------|--------|
| Need custom quantization (AWQ/GPTQ) | Deploy vLLM directly with quantized model |
| Throughput is insufficient | vLLM with tuned batch sizes and parallelism |
| Model not in KAITO supported list | Manual deployment required |
| Need request routing between models | Deploy with Triton or custom gateway |
| Need to serve 5+ models on shared GPUs | Time-slicing + custom deployment |

## Resources

- [vLLM documentation](https://docs.vllm.ai/)
- [Text Generation Inference](https://huggingface.co/docs/text-generation-inference/)
- [KEDA scalers](https://keda.sh/docs/scalers/)
- [NVIDIA GPU sharing](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/gpu-sharing.html)
