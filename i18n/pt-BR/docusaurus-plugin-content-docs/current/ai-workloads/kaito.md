---
sidebar_position: 2
title: "KAITO: AI Model Inference"
description: "Faça deploy de LLMs no AKS com um único custom resource usando o Kubernetes AI Toolchain Operator"
---

# KAITO: AI model inference

KAITO é o caminho mais rápido da seleção do modelo até o serving no AKS. Use-o a menos que você precise de frameworks de inference customizados ou otimização máxima de throughput.

## O que o KAITO faz

KAITO (Kubernetes AI Toolchain Operator) faz deploy de large language models no AKS com um único custom resource. Ele cuida das partes difíceis: provisionamento de nodes GPU, download do modelo, configuração do serving e gerenciamento de saúde.

![KAITO Workflow](/img/kaito-workflow.svg)

:::tip Opinião

KAITO cuida das partes difíceis: provisionamento de nodes GPU, download do modelo, configuração do serving. Não reinvente isso. Se você está fazendo deploy de um modelo suportado, KAITO economiza semanas de trabalho de infraestrutura.
:::

## Modelos suportados

| Família do Modelo | Exemplos | Requisito de GPU |
|-------------|----------|-----------------|
| Llama | Llama-2-7b, Llama-2-13b, Llama-2-70b | 1-8 GPUs dependendo do tamanho |
| Mistral | Mistral-7b, Mixtral-8x7b | 1-4 GPUs |
| Falcon | Falcon-7b, Falcon-40b | 1-4 GPUs |
| Phi | Phi-2, Phi-3-mini | 1 GPU |

## Fazendo deploy de um modelo

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

Esse é o deploy inteiro. Aplique este YAML e o KAITO:
1. Provisiona um node GPU (se nenhum estiver disponível)
2. Faz download dos pesos do modelo da fonte configurada
3. Inicia um servidor de inference vLLM ou Hugging Face
4. Cria um Service para acesso via API

## Instalação

```bash
# Enable KAITO on your AKS cluster
az aks update \
  --resource-group myrg \
  --name myaks \
  --enable-ai-toolchain-operator

# Verify KAITO pods are running
kubectl get pods -n kube-system -l app=ai-toolchain-operator
```

## Acessando o modelo

```bash
# Get the service endpoint
kubectl get svc llama2-7b -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Test inference
curl -X POST http://<SERVICE_IP>/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is Kubernetes?", "max_tokens": 200}'
```

## Como o KAITO se compara

| Funcionalidade | KAITO | Deploy Manual |
|---------|-------|-------------------|
| Tempo para deploy | Minutos | Dias a semanas |
| Provisionamento de nodes | Automático | Criação manual de nodepool |
| Download do modelo | Gerenciado | Você gerencia storage + download |
| Framework de serving | Pré-configurado | Você escolhe, configura, otimiza |
| Customização | Limitado a modelos suportados | Controle total |
| Otimização de throughput | Configurações padrão | Você otimiza batch size, quantização |

:::warning Quando NÃO Usar KAITO

- Seu modelo não está na lista de suportados
- Você precisa de quantização customizada (GPTQ, AWQ, GGUF)
- Você precisa de otimização máxima de throughput (configs customizadas do vLLM)
- Você precisa de multi-model serving em GPUs compartilhadas

Nesses casos, faça deploy do vLLM ou TGI diretamente. Veja [Inference Serving](./inference-serving).
:::

## Gerenciamento de workspace

```bash
# Check workspace status
kubectl get workspace llama2-7b

# View inference logs
kubectl logs -l apps=llama2-7b --tail=50

# Delete workspace (removes model + node)
kubectl delete workspace llama2-7b
```

## Erros comuns

1. **Não verificar a cota de GPU**-- KAITO provisiona nodes GPU. Se sua assinatura não tem cota, ele falha silenciosamente.
2. **Fazer deploy de modelos 70B em 1 GPU** -- Modelos grandes precisam de múltiplas GPUs. Verifique os requisitos do modelo.
3. **Deixar workspaces rodando** -- Nodes GPU são caros. Exclua workspaces quando não estiverem em uso.
4. **Esperar throughput de produção com configurações padrão** -- KAITO otimiza para simplicidade, não para máximo de tokens/segundo.

## Recursos

- [KAITO AI Toolchain Operator](https://learn.microsoft.com/azure/aks/ai-toolchain-operator)
- [KAITO GitHub repository](https://github.com/kaito-project/kaito)
- [Supported model list](https://github.com/kaito-project/kaito/tree/main/presets)
