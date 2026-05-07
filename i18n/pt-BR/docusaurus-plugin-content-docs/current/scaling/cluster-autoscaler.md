---
sidebar_position: 2
title: "Cluster Autoscaler"
description: "Adicione e remova nodes automaticamente com base na pressão de agendamento de pods. Pare de pagar por VMs ociosas."
---

# Cluster Autoscaler

O HPA escala pods. O Cluster Autoscaler escala os nodes onde esses pods rodam. Sem ele, o HPA cria pods que ficam em estado Pending para sempre porque não há onde agendá-los.

## Como Funciona

A lógica é direta:

1. **Scale up**: Um pod não pode ser agendado (nenhum node tem recursos suficientes). O CA provisiona um novo node.
2. **Scale down**: Um node está subutilizado (abaixo do threshold) por um período prolongado. O CA drena e remove o node.

:::info

O Cluster Autoscaler NÃO olha para a utilização de CPU/memória nos nodes. Ele olha para **falhas de agendamento** (scale up) e **densidade de empacotamento de pods** (scale down). Esta é uma distinção crítica que a maioria dos times erra.
:::

## Habilitando no AKS

```bash
# Enable on existing node pool
az aks nodepool update \
  --resource-group myRG \
  --cluster-name myAKS \
  --name nodepool1 \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 10

# Or during cluster creation
az aks create \
  --resource-group myRG \
  --name myAKS \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 10 \
  --node-vm-size Standard_D4s_v5
```

## Parâmetros-Chave

| Parâmetro | Valor Recomendado | Justificativa |
|-----------|------------------|-----------|
| `min-count` | 2 | Sobreviver a uma falha de node único |
| `max-count` | Depende do orçamento | Defina com base no teto de custo, não em pensamento otimista |
| `scan-interval` | 10s (padrão) | O padrão é suficiente. Varredura mais rápida desperdiça chamadas de API |
| `scale-down-delay-after-add` | 10m | Novos nodes precisam de tempo para receber pods. Removê-los imediatamente é desperdício |
| `scale-down-utilization-threshold` | 0.5 | O node deve estar abaixo de 50% de utilização para ser candidato à remoção |
| `scale-down-unneeded-time` | 10m | O node deve estar subutilizado por 10 min antes da remoção |

:::warning

Defina `scale-down-delay-after-add` para pelo menos 10 minutos. Sem isso, o CA adiciona um node, pods são agendados, alguns terminam rápido, o node parece subutilizado, o CA remove, pods ficam em Pending, o CA adiciona de novo. Essa oscilação desperdiça dinheiro e cria instabilidade.
:::

## Node Autoprovision (NAP) vs Cluster Autoscaler

| Recurso | Cluster Autoscaler | NAP (AKS Automatic) |
|---------|-------------------|---------------------|
| Criação de node pool | Manual (você define os pools) | Automática (escolhe o SKU da VM) |
| Seleção de SKU | Você escolhe antecipadamente | Corresponde aos requisitos do workload |
| Múltiplos tipos de workload | Requer múltiplos pools | Lida automaticamente |
| Suporte a GPU/Spot | Configuração manual do pool | Automático baseado em tolerations |
| Complexidade | Média | Baixa |

Se você está no **AKS Automatic**, o NAP cuida do scaling de nodes para você. Ele lê os resource requests e tolerations dos pods, depois escolhe o melhor SKU de VM e cria node pools sob demanda. Pare de gerenciar node pools manualmente.

Se você está no **AKS Standard**, use Cluster Autoscaler com node pools construídos por propósito.

## Boa Prática: Múltiplos Node Pools

Não rode tudo em um único node pool `Standard_D4s_v5`. Segmente por classe de workload:

```bash
# General workloads
az aks nodepool add --name general \
  --node-vm-size Standard_D4s_v5 \
  --enable-cluster-autoscaler --min-count 2 --max-count 10

# Memory-intensive (caches, in-memory DBs)
az aks nodepool add --name highmem \
  --node-vm-size Standard_E4s_v5 \
  --enable-cluster-autoscaler --min-count 0 --max-count 5 \
  --labels workload=memory-intensive

# GPU workloads (ML inference)
az aks nodepool add --name gpu \
  --node-vm-size Standard_NC6s_v3 \
  --enable-cluster-autoscaler --min-count 0 --max-count 3 \
  --labels workload=gpu --node-taints gpu=true:NoSchedule
```

:::tip

Defina `min-count 0` em pools especializados (GPU, alta memória). Deixe-os escalar a zero quando nenhum workload precisar deles. Apenas o seu pool general precisa de um mínimo diferente de zero.
:::

## Erros Comuns

**Definir max-count muito baixo.** Durante um pico de tráfego, o CA atinge o teto e seus pods ficam em Pending. Monitore eventos de pods não-agendáveis e aumente o max-count antes de precisar.

**Não usar Pod Disruption Budgets.** Quando o CA remove um node, ele despeja pods. Sem um PDB, todas as réplicas naquele node podem terminar simultaneamente. Sempre defina PDBs para workloads de produção.

**Ignorar o tempo de inicialização do node.** Um novo node AKS leva 2-4 minutos para ficar Ready. O CA não fornece capacidade instantânea. Planeje para essa latência com margem apropriada no HPA.

**Node pool único para tudo.** Um pod pesado em memória em um node otimizado para CPU desperdiça recursos. Use node affinity e taints para direcionar workloads aos SKUs de VM apropriados.

**Esquecer das availability zones.** Configure `--zones 1 2 3` nos node pools. O CA respeita a topologia de zonas e distribui nodes entre zonas para alta disponibilidade.

## Monitorando o Cluster Autoscaler

```bash
# Check CA status
kubectl -n kube-system get configmap cluster-autoscaler-status -o yaml

# View CA logs
kubectl -n kube-system logs -l app=cluster-autoscaler --tail=50

# Check for unschedulable pods
kubectl get pods --field-selector=status.phase=Pending
```

## Recursos

- [AKS Cluster Autoscaler](https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler-overview)
- [Node Autoprovision](https://learn.microsoft.com/en-us/azure/aks/node-autoprovision)
- [Cluster Autoscaler Parameters](https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler#cluster-autoscaler-profile-settings)
