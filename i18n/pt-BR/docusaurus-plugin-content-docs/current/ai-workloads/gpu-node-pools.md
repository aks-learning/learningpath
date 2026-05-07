---
sidebar_position: 1
title: "GPU Node Pools"
description: "Provisionamento e gerenciamento de nodes GPU no AKS para cargas de trabalho de ML/IA"
---

# GPU Node Pools

GPUs são caras. Configure-as corretamente, escale para zero quando ociosas e use instâncias spot para jobs de treinamento que suportam checkpoint.

## Famílias de VMs GPU

| Série | GPU | VRAM | Caso de Uso | Opinião |
|--------|-----|------|-------------|---------|
| NC A100 v4 | A100 | 80 GB | Maioria das cargas ML/IA | Escolha padrão para inference e fine-tuning |
| ND H100 v5 | H100 | 80 GB | Treinamento de modelos grandes | Quando A100 não é suficiente (modelos com 100B+ parâmetros) |
| NC T4 v3 | T4 | 16 GB | Inference leve, dev/test | Opção econômica, boa para testes |
| NV v3 | M60 | 8 GB | Apenas visualização | Não serve para ML/IA |

:::tip Opinião

Use `Standard_NC24ads_A100_v4` para a maioria das cargas de trabalho ML/IA. Ela dá conta de inference, fine-tuning e treinamento moderado. Só migre para ND H100 para treinamento distribuído em larga escala. Use NC T4 para dev/test e inference leve onde custo importa mais que throughput.
:::

## Criando um GPU Node Pool

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

Sempre aplique taint nos nodes GPU com `NoSchedule`. Sem taints, o scheduler vai colocar workloads regulares nos seus nodes GPU caros. O taint garante que apenas pods com tolerations correspondentes sejam alocados ali.
:::

## NVIDIA Device Plugin

O AKS instala automaticamente o NVIDIA device plugin nos nodes GPU. Você não precisa instalá-lo manualmente. Ele expõe `nvidia.com/gpu` como um recurso agendável.

## Solicitando GPU na Spec do Pod

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

GPUs não podem ser compartilhadas entre containers nativamente. Se você solicitar `nvidia.com/gpu: 1`, você recebe uma GPU inteira. Para compartilhamento, veja NVIDIA MIG (Multi-Instance GPU) ou time-slicing -- abordados em [Inference Serving](./inference-serving).
:::

## Instâncias Spot para GPU

Use spot para jobs de treinamento que suportam checkpoint. Nunca use spot para inference serving.

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

| Carga de Trabalho | Usar Spot? | Por quê |
|----------|-----------|-----|
| Treinamento de modelo (com checkpointing) | Sim | Economiza 60-90%, reinicia do checkpoint em caso de eviction |
| Batch inference (não tempo-real) | Sim | Reenfileira batches que falharam |
| Inference serving em tempo real | Não | Eviction causa indisponibilidade para o usuário |
| Fine-tuning (horas de duração) | Sim, com checkpoints | Economiza significativamente em jobs longos |

## Gestão de Custos

GPUs são 5-10x mais caras que computação geral. Gerencie custos agressivamente:

1. **Escale para zero**: Configure `--min-count 0` nos pools GPU. O autoscaler remove nodes quando não há pods GPU pendentes.
2. **Use spot para treinamento**: 60-90% mais barato para trabalhos interrompíveis.
3. **Dimensione corretamente os requests de GPU**: Não solicite 4 GPUs quando 1 basta. Cada GPU ociosa desperdiça $2-10/hora.
4. **Agende treinamento fora do pico**: A disponibilidade de spot é maior fora do horário de pico.

```bash
# Check current GPU utilization before adding capacity
kubectl top pods -l workload=gpu --containers
```

## Erros Comuns

1. **Não aplicar taint nos nodes GPU** -- Pods regulares ocupam nodes GPU caros.
2. **Configurar min-count > 0 para cargas intermitentes** -- Pagando por GPUs ociosas 24/7.
3. **Usar spot para inference em produção** -- Usuários recebem erros quando nodes são despejados.
4. **Esquecer das zonas de disponibilidade** -- SKUs de GPU têm disponibilidade limitada por zona. Verifique antes.

## Recursos

- [GPU clusters on AKS](https://learn.microsoft.com/azure/aks/gpu-cluster)
- [Use spot node pools](https://learn.microsoft.com/azure/aks/spot-node-pool)
- [NVIDIA GPU Operator](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/)
