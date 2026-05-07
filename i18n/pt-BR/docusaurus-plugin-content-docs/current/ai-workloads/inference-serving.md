---
sidebar_position: 3
title: "Model Inference Serving"
description: "LLM serving em produção no AKS -- KAITO, vLLM, TGI e estratégias de autoscaling"
---

# Model Inference Serving

Comece com KAITO pela simplicidade. Evolua para vLLM quando precisar extrair o máximo de throughput de GPUs caras.

## Comparação de frameworks de serving

| Framework | Throughput | Facilidade de Setup | Melhor Para |
|-----------|-----------|---------------|----------|
| **KAITO** | Bom (configurações padrão) | Trivial (1 YAML) | Começar, modelos padrão |
| **vLLM** | Mais alto (PagedAttention) | Médio (deploy manual) | LLM serving em produção em escala |
| **TGI** | Alto | Médio | Modelos do ecossistema HuggingFace |
| **Triton** | Alto (multi-framework) | Complexo | Multi-model, serving multi-framework |
| **Custom** | Varia | Difícil | Modelos proprietários, requisitos especiais |

:::tip Opinião

KAITO para simplicidade. vLLM para throughput máximo em LLM serving de produção. Essa é a árvore de decisão para 90% das equipes.
:::

## vLLM no AKS

vLLM usa PagedAttention e continuous batching para atingir o maior tokens/segundo em hardware GPU. Se você está servindo LLMs em escala, este é o framework a ser usado.

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

## Autoscaling de inference

Use KEDA com métricas customizadas para escalar réplicas de inference com base na demanda real.

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

Escale com base na profundidade da fila (requests pendentes), não na utilização de GPU. A utilização de GPU permanece alta mesmo quando o throughput está adequado. A profundidade da fila indica quando os usuários estão realmente esperando.
:::

## Compartilhamento de GPU multi-model

Uma GPU por modelo é desperdício para modelos pequenos ou endpoints com pouco tráfego. Opções:

| Estratégia | Como Funciona | Quando Usar |
|----------|-------------|-------------|
| **Time-slicing** | Acesso round-robin à GPU entre containers | Múltiplos modelos pequenos, latência aceitável |
| **MIG (Multi-Instance GPU)** | Particiona fisicamente a A100 em fatias independentes | Isolamento entre modelos, apenas A100/H100 |
| **Múltiplos modelos em um processo** | vLLM/Triton servem múltiplos modelos | Mesmo framework, memória compartilhada |

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

Isso faz cada GPU física aparecer como 4 GPUs agendáveis. Os pods compartilham a GPU via time-slicing.

## Checklist de otimização de performance

1. **Habilite continuous batching** -- vLLM faz isso por padrão. TGI precisa de `--max-batch-prefill-tokens`.
2. **Defina o max model length apropriado** -- Contexto menor = mais requests concorrentes.
3. **Use quantização para inference** -- AWQ ou GPTQ reduzem memória, com perda mínima de qualidade.
4. **Tensor parallelism para modelos grandes** -- Divida entre GPUs quando o modelo não cabe em uma.
5. **Pré-carregue modelos** -- Use init containers ou PVCs com pesos em cache. Não faça download a cada início de pod.

:::warning Erro Comum

Baixar os pesos do modelo do HuggingFace a cada reinício do pod. Um modelo 13B tem 26GB. Use um PVC com pesos pré-baixados ou um init container que faça cache em um volume compartilhado.
:::

## Quando evoluir do KAITO para custom

| Sinal | Ação |
|--------|--------|
| Precisa de quantização customizada (AWQ/GPTQ) | Faça deploy do vLLM diretamente com modelo quantizado |
| Throughput insuficiente | vLLM com batch sizes e paralelismo ajustados |
| Modelo não está na lista de suportados do KAITO | Deploy manual necessário |
| Precisa de roteamento de requests entre modelos | Faça deploy com Triton ou gateway customizado |
| Precisa servir 5+ modelos em GPUs compartilhadas | Time-slicing + deploy customizado |

## Recursos

- [vLLM documentation](https://docs.vllm.ai/)
- [Text Generation Inference](https://huggingface.co/docs/text-generation-inference/)
- [KEDA scalers](https://keda.sh/docs/scalers/)
- [NVIDIA GPU sharing](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/gpu-sharing.html)
