---
sidebar_position: 1
title: "Decisoes de Design do Cluster"
description: "Orientacao opinativa sobre topologia de cluster AKS, node pools, SKUs de VM e convencoes de nomenclatura"
---

# Decisoes de Design do Cluster

Acerte essas decisoes no primeiro dia. Mudar a topologia do cluster depois significa downtime, migracao e dor de cabeca.

## Cluster Unico vs Multi-Cluster

Comece com um cluster. Use isolamento por namespace com network policies para separar times e ambientes. Evolua para multi-cluster somente quando precisar de reducao de raio de explosao, failover multi-regiao ou limites rigidos de compliance entre workloads.

:::warning Erro Comum

Times criam um cluster por ambiente (dev, staging, prod) no primeiro dia. Voce acaba gerenciando 9 clusters antes de ter um unico workload em producao. Comece com um cluster, tres namespaces.
:::

| Cenario | Recomendacao |
|---------|-------------|
| Time unico, regiao unica | Um cluster, isolamento por namespace |
| Multiplos times, compliance compartilhado | Um cluster, isolamento por namespace + network policy |
| Multi-regiao ou raio de explosao rigido | Multi-cluster com GitOps |
| Workloads regulados junto com nao-regulados | Clusters separados, subscriptions separadas |

## Estrategia de Node Pool

Separe pools de sistema de pools de usuario. Nunca misture seus workloads no pool de sistema.

```bash
# System pool: dedicated to kube-system components
az aks nodepool add \
  --cluster-name myaks \
  --resource-group myrg \
  --name system \
  --mode System \
  --node-vm-size Standard_D4s_v5 \
  --node-count 3 \
  --zones 1 2 3 \
  --node-taints CriticalAddonsOnly=true:NoSchedule

# User pool: your actual workloads
az aks nodepool add \
  --cluster-name myaks \
  --resource-group myrg \
  --name apps \
  --mode User \
  --node-vm-size Standard_D8s_v5 \
  --min-count 3 \
  --max-count 20 \
  --enable-cluster-autoscaler \
  --zones 1 2 3
```

:::tip Opiniao

Pool de sistema: `Standard_D4s_v5`, 3 nodes, com taint `CriticalAddonsOnly`. Pools de usuario: escolha com base no workload. Nunca misture workloads no pool de sistema -- um pod de aplicacao com mau comportamento nunca deveria deixar o CoreDNS sem recursos.
:::

## Selecao de SKU de VM

| Serie | Caso de Uso | Opiniao |
|-------|-------------|---------|
| D-series v5 | Computacao geral, web apps, APIs | Escolha padrao para a maioria dos workloads |
| E-series v5 | Intensivo em memoria (caches, bancos in-memory) | Quando sua aplicacao precisa de >8GB por core |
| N-series | GPU, inferencia e treinamento de ML/IA | Veja [GPU Node Pools](../ai-workloads/gpu-node-pools) |
| B-series | Burstable, apenas dev/test | Nunca para producao. Performance imprevisivel. |
| F-series v2 | Processamento batch otimizado para compute | Workloads com alta razao CPU-para-memoria |

:::warning

VMs B-series sofrem throttling de CPU apos consumir creditos de burst. Seu workload de producao vai desacelerar aleatoriamente sob carga sustentada. Use D-series em vez disso.
:::

## Selecao de Regiao

Escolha uma regiao que suporte Availability Zones e esteja proxima dos seus usuarios. Verifique a disponibilidade de SKU de GPU antes de se comprometer se voce planeja workloads de IA.

```bash
# Check if your desired VM SKU is available in the region
az vm list-skus --location eastus2 --size Standard_D8s_v5 --output table
```

Regioes preferidas para novos deployments: East US 2, West US 3, North Europe, West Europe. Todas tem suporte completo a AZ e ampla disponibilidade de SKUs.

## Convencoes de Nomenclatura

Consistencia previne confusao em escala:

| Recurso | Padrao | Exemplo |
|---------|--------|---------|
| Cluster | `aks-{app}-{env}-{regiao}` | `aks-platform-prod-eus2` |
| Node pool | `{workload}{tamanho}` | `apps`, `gpua100`, `system` |
| Namespace | `{time}-{servico}` | `payments-api`, `data-pipeline` |
| Resource group | `rg-{app}-{env}-{regiao}` | `rg-platform-prod-eus2` |

:::info

Nomes de node pool sao limitados a 12 caracteres (Linux) ou 6 caracteres (Windows). Mantenha-os curtos e significativos.
:::

## Recursos

- [Arquitetura Baseline do AKS](https://learn.microsoft.com/azure/architecture/reference-architectures/containers/aks/baseline-aks)
- [Tamanhos de VM para AKS](https://learn.microsoft.com/azure/aks/quotas-skus-regions)
- [Availability Zones no AKS](https://learn.microsoft.com/azure/aks/availability-zones)
