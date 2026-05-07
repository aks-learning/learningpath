---
sidebar_position: 1
title: "Decisões de Design do Cluster"
description: "Orientação opinativa sobre topologia de cluster AKS, node pools, SKUs de VM e convenções de nomenclatura"
---

# Decisões de design do cluster

Acerte essas decisões no primeiro dia. Mudar a topologia do cluster depois significa downtime, migração e dor de cabeça.

## Cluster único vs multi-cluster

Comece com um cluster. Use isolamento por namespace com network policies para separar times e ambientes. Evolua para multi-cluster somente quando precisar de redução de raio de explosão, failover multi-região ou limites rígidos de compliance entre workloads.

:::warning Erro Comum

Times criam um cluster por ambiente (dev, staging, prod) no primeiro dia. Você acaba gerenciando 9 clusters antes de ter um único workload em produção. Comece com um cluster, três namespaces.
:::

| Cenário | Recomendação |
|---------|-------------|
| Time único, região única | Um cluster, isolamento por namespace |
| Múltiplos times, compliance compartilhado | Um cluster, isolamento por namespace + network policy |
| Multi-região ou raio de explosão rígido | Multi-cluster com GitOps |
| Workloads regulados junto com não-regulados | Clusters separados, subscriptions separadas |

## Estratégia de node pool

Separe pools de sistema de pools de usuário. Nunca misture seus workloads no pool de sistema.

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

:::tip Opinião

Pool de sistema: `Standard_D4s_v5`, 3 nodes, com taint `CriticalAddonsOnly`. Pools de usuário: escolha com base no workload. Nunca misture workloads no pool de sistema -- um pod de aplicação com mau comportamento nunca deveria deixar o CoreDNS sem recursos.
:::

## Seleção de SKU de VM

| Série | Caso de Uso | Opinião |
|-------|-------------|---------|
| D-series v5 | Computação geral, web apps, APIs | Escolha padrão para a maioria dos workloads |
| E-series v5 | Intensivo em memória (caches, bancos in-memory) | Quando sua aplicação precisa de >8GB por core |
| N-series | GPU, inferência e treinamento de ML/IA | Veja [GPU Node Pools](../ai-workloads/gpu-node-pools) |
| B-series | Burstable, apenas dev/test | Nunca para produção. Performance imprevisível. |
| F-series v2 | Processamento batch otimizado para compute | Workloads com alta razão CPU-para-memória |

:::warning

VMs B-series sofrem throttling de CPU após consumir créditos de burst. Seu workload de produção vai desacelerar aleatoriamente sob carga sustentada. Use D-series em vez disso.
:::

## Seleção de região

Escolha uma região que suporte Availability Zones e esteja próxima dos seus usuários. Verifique a disponibilidade de SKU de GPU antes de se comprometer se você planeja workloads de IA.

```bash
# Check if your desired VM SKU is available in the region
az vm list-skus --location eastus2 --size Standard_D8s_v5 --output table
```

Regiões preferidas para novos deployments: East US 2, West US 3, North Europe, West Europe. Todas tem suporte completo a AZ e ampla disponibilidade de SKUs.

## Convenções de nomenclatura

Consistência previne confusão em escala:

| Recurso | Padrão | Exemplo |
|---------|--------|---------|
| Cluster | `aks-{app}-{env}-{regiao}` | `aks-platform-prod-eus2` |
| Node pool | `{workload}{tamanho}` | `apps`, `gpua100`, `system` |
| Namespace | `{time}-{servico}` | `payments-api`, `data-pipeline` |
| Resource group | `rg-{app}-{env}-{regiao}` | `rg-platform-prod-eus2` |

:::info

Nomes de node pool são limitados a 12 caracteres (Linux) ou 6 caracteres (Windows). Mantenha-os curtos e significativos.
:::

## Recursos

- [Arquitetura Baseline do AKS](https://learn.microsoft.com/azure/architecture/reference-architectures/containers/aks/baseline-aks)
- [Tamanhos de VM para AKS](https://learn.microsoft.com/azure/aks/quotas-skus-regions)
- [Availability Zones no AKS](https://learn.microsoft.com/azure/aks/availability-zones)
