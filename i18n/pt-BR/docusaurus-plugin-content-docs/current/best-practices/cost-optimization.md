---
sidebar_position: 3
title: "Otimizacao de Custos"
description: "Estrategias praticas para reduzir custos do AKS em 40-60% sem sacrificar confiabilidade"
---

# Otimizacao de Custos

Spot para batch/dev, Reserved Instances para baseline de producao, on-demand para burst. Essa combinacao economiza 40-60% comparado ao preco puramente on-demand.

## A Pilha de Estrategia de Custos

| Estrategia | Economia | Aplica-se a | Contrapartida |
|------------|----------|-------------|---------------|
| Spot instances | 60-90% | Dev/test, batch jobs, treinamento | Risco de eviction |
| Reserved Instances (1 ano) | 30-40% | Nodes de producao em estado estavel | Compromisso |
| Reserved Instances (3 anos) | 50-60% | Workloads previsiveis de longa duracao | Compromisso mais longo |
| Savings Plans | 20-30% | Compromisso flexivel de computacao | Menos economia que RI |
| Escalar para zero (nao-prod) | 60%+ | Clusters dev/test a noite | Atraso de cold start |
| Right-sizing | 20-40% | Workloads superdimensionados | Requer analise |

:::tip Opiniao

Desligue clusters de dev/test a noite. Isso e 60% do tempo em que eles estao rodando por nada. Um cluster dev de 3 nodes custa ~$500/mes. Desliga-lo 14 horas/dia economiza $300/mes por cluster.
:::

## Node Pools Spot

VMs Spot sao capacidade ociosa do Azure com desconto de 60-90%. O Azure pode fazer eviction delas com 30 segundos de aviso.

```bash
# Add spot pool for batch/dev workloads
az aks nodepool add \
  --resource-group myrg \
  --cluster-name myaks \
  --name spot \
  --priority Spot \
  --eviction-policy Delete \
  --spot-max-price -1 \
  --node-vm-size Standard_D8s_v5 \
  --min-count 0 \
  --max-count 20 \
  --enable-cluster-autoscaler \
  --node-taints "kubernetes.azure.com/scalesetpriority=spot:NoSchedule"
```

| Tipo de Workload | Usar Spot? | Por que |
|------------------|------------|---------|
| Ambientes dev/test | Sim | Eviction apenas significa reiniciar |
| Processamento batch | Sim | Re-enfileirar jobs com falha |
| Treinamento de ML (com checkpoints) | Sim | Retomar do ultimo checkpoint |
| Frontends web stateless (nao-prod) | Sim | Scale-out lida com evictions |
| APIs de producao | Nao | Disponibilidade para o usuario e necessaria |
| Bancos de dados | Nunca | Risco de perda de dados em eviction |

## Reserved Instances

Para nodes que rodam 24/7/365, compre RIs. A conta e simples.

```
On-demand D8s_v5: ~$280/month
1-year RI:        ~$180/month (36% savings)
3-year RI:        ~$120/month (57% savings)
```

:::info

Compre RIs para seu system node pool e baseline de producao. Esses nodes sempre rodam. Use on-demand para capacidade de burst do autoscaler que vai e volta.
:::

## Escalar para Zero: Clusters Nao-Producao

```yaml
# KEDA cron scaler: scale to 0 at night, back up in morning
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: workday-scaler
  namespace: dev
spec:
  scaleTargetRef:
    name: my-app
  minReplicaCount: 0
  maxReplicaCount: 5
  triggers:
    - type: cron
      metadata:
        timezone: America/New_York
        start: "0 8 * * 1-5"
        end: "0 22 * * 1-5"
        desiredReplicas: "3"
```

Para node pools inteiros, o cluster autoscaler gerencia o scale-to-zero quando nenhum pod precisa de agendamento.

## Right-Sizing de Workloads

A maioria dos times solicita CPU e memoria em excesso. Use as recomendacoes do VPA para encontrar a utilizacao real:

```bash
# Install metrics-server (usually pre-installed in AKS)
kubectl top pods --all-namespaces --sort-by=cpu

# Check requests vs actual usage
kubectl top pod my-pod --containers
# If actual is 50m CPU but request is 500m, you're wasting 90%
```

:::warning Erro Comum

Definir requests de CPU em 1 core "so por seguranca" quando o pod usa 50m. Dez pods assim reservam 10 cores mas usam 0,5. Sao 9,5 cores de capacidade desperdicada que voce esta pagando.
:::

## Ajuste do Cluster Autoscaler

```bash
# Aggressive scale-down for non-critical pools
az aks nodepool update \
  --resource-group myrg \
  --cluster-name myaks \
  --name apps \
  --update-config scale-down-delay-after-add=5m \
  --update-config scale-down-unneeded-time=5m \
  --update-config scale-down-utilization-threshold=0.5
```

| Configuracao | Producao | Dev/Test |
|--------------|----------|----------|
| `scale-down-unneeded-time` | 10m | 3m |
| `scale-down-delay-after-add` | 10m | 5m |
| `scale-down-utilization-threshold` | 0.5 | 0.3 |
| `max-graceful-termination-sec` | 600 | 60 |

## Checklist de Ganhos Rapidos

1. **Spot pools para dev/test** -- Economia imediata de 60-90% em computacao nao-prod.
2. **RIs para system + baseline de prod** -- Economia de 30-57% em nodes que sempre rodam.
3. **Escalar nao-prod para zero a noite** -- 60% de economia de tempo.
4. **Right-size nos requests** -- Revise a saida de top pods mensalmente.
5. **Deletar discos orfaos** -- PVCs com politica `Delete` que falharam deixam discos para tras.
6. **Usar tier Standard apenas para prod** -- Tier Free para dev/test economiza o custo do tier.

## Recursos

- [Otimizacao de custos do AKS](https://learn.microsoft.com/azure/aks/best-practices-cost)
- [Spot node pools](https://learn.microsoft.com/azure/aks/spot-node-pool)
- [Cluster autoscaler](https://learn.microsoft.com/azure/aks/cluster-autoscaler)
- [Azure Reservations](https://learn.microsoft.com/azure/cost-management-billing/reservations/save-compute-costs-reservations)
