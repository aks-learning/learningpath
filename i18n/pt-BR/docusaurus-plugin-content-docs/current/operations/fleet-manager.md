---
sidebar_position: 4
title: "Azure Kubernetes Fleet Manager"
description: "Guia opinativo sobre Fleet Manager para orquestração de upgrades multi-cluster e gerenciamento de workloads."
---

# Azure Kubernetes Fleet Manager

Fleet Manager permite gerenciar múltiplos clusters AKS como uma entidade única. Upgrades coordenados, posicionamento de workloads e rede multi-cluster a partir de um único control plane.

:::tip Você precisa do Fleet Manager quando tem 3+ clusters

Abaixo desse limite, gerencie os clusters individualmente. O overhead do Fleet Manager não se justifica para 1-2 clusters. Com 3+, a coordenação manual de upgrades e deploys se torna propensa a erros e demorada.
:::

## Quando Usar Fleet Manager

| Cenário | Fleet Manager? | Por quê |
|----------|---------------|-----|
| 1-2 clusters | Não | Gerenciamento manual é suficiente |
| 3-5 clusters, mesma aplicação | Sim | Upgrades coordenados economizam horas |
| 5+ clusters, multi-region | Sim | Essencial para sanidade |
| Plataforma multi-tenant | Sim | Aplicação consistente de políticas |
| Cluster único, múltiplos node pools | Não | Use o AKS diretamente |

## Conceitos Centrais

**Fleet Hub**: Um control plane leve que coordena os clusters membros. Ele não roda seus workloads.

**Member Clusters**: Seus clusters AKS existentes associados à fleet. Eles mantêm total independência -- Fleet Manager orquestra, não possui.

**Update Runs**: Rollouts de upgrade em estágios entre clusters em ondas configuráveis.

**Update Stages**: Grupos de clusters atualizados juntos dentro de um update run.

## Criando uma Fleet

```bash
# Create the fleet hub
az fleet create \
  --resource-group myRG \
  --name myFleet \
  --location eastus2

# Join an existing AKS cluster as a member
az fleet member create \
  --resource-group myRG \
  --fleet-name myFleet \
  --name staging-cluster \
  --member-cluster-id /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/staging-aks

# Join production cluster
az fleet member create \
  --resource-group myRG \
  --fleet-name myFleet \
  --name prod-eastus \
  --member-cluster-id /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/prod-eastus-aks
```

## Update Runs: Upgrades em Estágios

Essa é a funcionalidade matadora. Em vez de atualizar todos os clusters de uma vez e torcer pelo melhor, você define estágios que são executados sequencialmente.

**Estratégia de exemplo**: staging -> prod-region1 -> prod-region2

```bash
# Create update run with stages
az fleet updaterun create \
  --resource-group myRG \
  --fleet-name myFleet \
  --name upgrade-to-128 \
  --upgrade-type Full \
  --kubernetes-version 1.28.5 \
  --stages @stages.json
```

O `stages.json` define a ordem de rollout:

```json
{
  "stages": [
    {
      "name": "staging",
      "groups": [
        { "name": "staging-group" }
      ],
      "afterStageWaitInSeconds": 3600
    },
    {
      "name": "prod-wave1",
      "groups": [
        { "name": "prod-eastus-group" }
      ],
      "afterStageWaitInSeconds": 3600
    },
    {
      "name": "prod-wave2",
      "groups": [
        { "name": "prod-westus-group" }
      ]
    }
  ]
}
```

:::info Comece com orquestração de upgrades no nível da fleet

Só isso já justifica o Fleet Manager. A capacidade de escalonar upgrades entre clusters com períodos de espera automáticos entre estágios elimina a tarefa operacional mais perigosa em ambientes multi-cluster. Rede multi-cluster é um bônus por cima disso.
:::

## Update Strategies

Defina estratégias de upgrade reutilizáveis em vez de recriar estágios para cada update run:

```bash
az fleet updatestrategy create \
  --resource-group myRG \
  --fleet-name myFleet \
  --name standard-rollout \
  --stages @stages.json
```

Depois referencie a strategy nos update runs. Isso oferece padrões de upgrade consistentes e repetíveis.

## Multi-Cluster Services (Preview)

Fleet Manager pode expor Services Kubernetes entre clusters membros usando balanceamento de carga L4 multi-cluster. Tráfego de um cluster pode alcançar pods em outro cluster.

Casos de uso:
- Deploys active-active onde qualquer cluster pode atender qualquer request
- Migração gradual de tráfego durante migrações
- Descoberta de serviços cross-cluster

:::warning Rede multi-cluster adiciona complexidade

Não habilite multi-cluster services a menos que tenha uma necessidade clara. Isso introduz dependências de rede cross-cluster que complicam a depuração. A maioria das equipes precisa apenas de upgrades coordenados.
:::

## Fleet Manager vs Gerenciamento Manual

| Operação | Manual (3 clusters) | Fleet Manager |
|-----------|---------------------|---------------|
| Upgrade do K8s | 3 comandos az aks upgrade separados, ordenação manual | 1 update run, escalonamento automático |
| Rollback em falha | Acessar cada cluster, diagnosticar | Fleet pausa automaticamente |
| Trilha de auditoria | Verificar log de atividade de cada cluster | Histórico centralizado de update runs |
| Aplicação de políticas | Aplicar em cada cluster individualmente | ClusterResourcePlacement no nível da fleet |
| Tempo para atualizar 5 clusters | Horas (sequencial, validação manual) | Minutos (automatizado, em estágios) |

## Erros Comuns

1. **Adicionar Fleet Manager para 1-2 clusters** -- O overhead excede o benefício. Espere até ter 3+.
2. **Sem tempo de espera entre estágios** -- Se staging quebrar, você quer tempo para detectar antes que produção seja atualizada.
3. **Todos os clusters em um estágio** -- Anula o propósito. Crie ondas significativas (staging, prod-region1, prod-region2).
4. **Ignorar a saúde dos clusters membros** -- Fleet Manager vai atualizar um cluster não saudável. Verifique a saúde antes de disparar update runs.

## Decisão: Você Precisa do Fleet Manager?

![Fleet Manager Decision Tree](/img/fleet-manager-decision.svg)

## Recursos

- [Azure Kubernetes Fleet Manager Overview](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/overview)
- [Create a Fleet and Join Members](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/quickstart-create-fleet-and-members)
- [Orchestrate Updates Across Clusters](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/update-orchestration)
- [Multi-Cluster Services](https://learn.microsoft.com/en-us/azure/kubernetes-fleet/l4-load-balancing)
- [Fleet Manager CLI Reference](https://learn.microsoft.com/en-us/cli/azure/fleet)
