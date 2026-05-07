---
sidebar_position: 2
title: "KAITO: AI Model Inference"
description: "Deploy LLMs on AKS with one custom resource using the Kubernetes AI Toolchain Operator"
---

# KAITO: AI model inference

KAITO is the fastest path from model selection to serving on AKS. Use it unless you need custom inference frameworks or maximum throughput optimization.

## What KAITO does

KAITO (Kubernetes AI Toolchain Operator) deploys large language models on AKS with a single custom resource. It handles the hard parts: GPU node provisioning, model download, serving setup, and health management.

![KAITO Workflow](/img/kaito-workflow.svg)

:::tip Opinion

KAITO handles the hard parts: GPU node provisioning, model download, serving setup. Don't reinvent this. If you're deploying a supported model, KAITO saves weeks of infrastructure work.
:::

## Supported models

| Model Family | Examples | GPU Requirement |
|-------------|----------|-----------------|
| Llama | Llama-2-7b, Llama-2-13b, Llama-2-70b | 1-8 GPUs depending on size |
| Mistral | Mistral-7b, Mixtral-8x7b | 1-4 GPUs |
| Falcon | Falcon-7b, Falcon-40b | 1-4 GPUs |
| Phi | Phi-2, Phi-3-mini | 1 GPU |

## Deploying a custom model from HuggingFace

KAITO is not limited to preset models. You can deploy any compatible model from HuggingFace:

```yaml
apiVersion: kaito.sh/v1alpha1
kind: Workspace
metadata:
  name: custom-model
spec:
  resource:
    instanceType: Standard_NC24ads_A100_v4
    count: 1
    labelSelector:
      matchLabels:
        apps: custom-model
  inference:
    model:
      name: "SmolLM2-1.7B-Instruct"
      registry: "HuggingFace"
```

## Deploying a preset model

```yaml
apiVersion: kaito.sh/v1alpha1
kind: Workspace
metadata:
  name: llama2-7b
  annotations:
    kaito.sh/enablelb: "True"
spec:
  resource:
    instanceType: Standard_NC24ads_A100_v4
    count: 1
    labelSelector:
      matchLabels:
        apps: llama2-7b
  inference:
    preset:
      name: llama-2-7b-chat
```

That's the entire deployment. Apply this YAML and KAITO:
1. Provisions a GPU node (if none available)
2. Downloads the model weights from the configured source
3. Starts a vLLM or Hugging Face inference server
4. Creates a Service for API access

## Installation

```bash
# Enable KAITO on your AKS cluster
az aks update \
  --resource-group myrg \
  --name myaks \
  --enable-ai-toolchain-operator

# Verify KAITO pods are running
kubectl get pods -n kube-system -l app=ai-toolchain-operator
```

## Accessing the model

```bash
# Get the service endpoint
kubectl get svc llama2-7b -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Test inference
curl -X POST http://<SERVICE_IP>/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is Kubernetes?", "max_tokens": 200}'
```

## How KAITO compares

| Feature | KAITO | Manual Deployment |
|---------|-------|-------------------|
| Time to deploy | Minutes | Days to weeks |
| Node provisioning | Automatic | Manual nodepool creation |
| Model download | Handled | You manage storage + download |
| Serving framework | Pre-configured | You pick, configure, tune |
| Customization | Preset models + custom models via HuggingFace | Full control |
| Throughput tuning | Default settings | You optimize batch size, quantization |

:::warning When NOT to Use KAITO

- You need custom quantization (GPTQ, AWQ, GGUF)
- You need maximum throughput optimization (custom vLLM configs)
- You need multi-model serving on shared GPUs

KAITO supports custom models from HuggingFace (e.g., SmolLM2-1.7B-Instruct) in addition to preset models, so an unsupported model alone is no longer a blocker.

In these cases, deploy vLLM or TGI directly. See [Inference Serving](./inference-serving).
:::

## Workspace management

```bash
# Check workspace status
kubectl get workspace llama2-7b

# View inference logs
kubectl logs -l apps=llama2-7b --tail=50

# Delete workspace (removes model + node)
kubectl delete workspace llama2-7b
```

## Common mistakes

1. **Not checking GPU quota** -- KAITO provisions GPU nodes. If your subscription lacks quota, it fails silently.
2. **Deploying 70B models on 1 GPU** -- Large models need multiple GPUs. Check model requirements.
3. **Leaving workspaces running** -- GPU nodes are expensive. Delete workspaces when not in use.
4. **Expecting production throughput from defaults** -- KAITO optimizes for simplicity, not maximum tokens/second.

## Resources

- [KAITO AI Toolchain Operator](https://learn.microsoft.com/azure/aks/ai-toolchain-operator)
- [KAITO GitHub repository](https://github.com/kaito-project/kaito)
- [Supported model list](https://github.com/kaito-project/kaito/tree/main/presets)
