---
sidebar_position: 3
title: "Gestão de Custos para AKS"
description: "O desperdício número um de custos no AKS são nodes superdimensionados. Dimensione agressivamente e acompanhe custos por namespace."
---

# Gestão de custos para AKS

O desperdício número um de custos no AKS são nodes superdimensionados. Times solicitam 4 CPU e 8 GB de memória para um pod que usa 0.3 CPU e 200 MB. Multiplique isso por 50 pods e você está pagando por 10 nodes quando precisa de 3. Dimensione agressivamente.

## De onde vem o custo do AKS

| Componente | Pelo Que Você Paga | % Típica do Total |
|-----------|-----------------|-------------------|
| VMs (node pools) | Computação para seus pods | 60-75% |
| Storage | Volumes persistentes, discos do SO | 10-20% |
| Rede | Load balancers, NAT gateway, IPs públicos | 5-15% |
| Egress | Dados saindo do Azure | 5-10% |
| Control plane | Gerenciamento do AKS | Gratuito (Standard tier) / $0.10/hr (Premium) |

O control plane é gratuito no Standard tier. Seu custo real são as VMs por baixo. Todo o resto é otimização nas margens.

## Habilitar o add-on de análise de custos do AKS

Isso é gratuito. Habilite. Ele fornece visibilidade de custos por namespace e por workload diretamente no portal do Azure.

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --enable-cost-analysis
```

:::tip

Habilite o add-on de análise de custos do AKS em todo cluster. É gratuito e fornece visibilidade por namespace sem instalar ferramentas de terceiros. Adicione KubeCost apenas se você precisar de chargebacks ou relatórios de showback por time.
:::

## Ferramentas de visibilidade de custos

| Ferramenta | Custo | Melhor Para | Limitação |
|------|------|----------|------------|
| Add-on de Análise de Custos do AKS | Gratuito | Custo por namespace/workload no portal | Sem tendências históricas além de 60 dias |
| Azure Cost Management | Gratuito | Nível de subscription/resource group | Não enxerga dentro do cluster |
| KubeCost (open source) | Gratuito | Custo detalhado por pod, chargebacks | Roda no cluster, consome recursos |
| OpenCost | Gratuito | Padrão CNCF, leve | UI menos polida que o KubeCost |

:::info

Azure Cost Management vê seu cluster como um custo de VM. Ele não consegue dizer qual namespace ou pod é responsável. Por isso você precisa do add-on do AKS ou do KubeCost para atribuição de custos dentro do cluster.
:::

## Estratégias-chave de custo

### 1. Dimensione suas VMs corretamente

Não escolha D16s_v5 porque "a gente pode precisar." Comece pequeno, monitore o uso real, e escale para cima apenas quando a utilização justificar.

```bash
# Check actual node utilization
kubectl top nodes

# Example output -- these nodes are oversized:
# NAME          CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
# node-pool-1   850m         5%     3200Mi          12%
# node-pool-2   920m         5%     2800Mi          11%
```

Se seus nodes consistentemente rodam abaixo de 40% de CPU e memória, você está pagando a mais. Reduza o SKU da VM ou diminua a contagem de nodes.

### 2. Instâncias Spot para workloads não-críticas

Use node pools Spot para jobs em lote, dev/test, runners de CI e qualquer workload que tolere interrupção. VMs Spot custam 60-90% menos que sob demanda.

```bash
az aks nodepool add \
  --resource-group myRG \
  --cluster-name myCluster \
  --name spotnodes \
  --priority Spot \
  --eviction-policy Delete \
  --spot-max-price -1 \
  --node-count 3 \
  --node-vm-size Standard_D4s_v5
```

:::warning

Não rode workloads stateful de produção em nodes Spot. Eles podem ser despejados com 30 segundos de aviso. Use Spot para processamento em lote stateless, agentes de build e ambientes de desenvolvimento.
:::

### 3. Instâncias reservadas para estado estacionário

Se você sabe que vai rodar 10 nodes D4s_v5 por 12 meses, compre Reserved Instances. Economia: 30-60% comparado a pay-as-you-go.

### 4. Reduza ambientes não-produção à noite

Um cluster de dev rodando 24/7 custa 3x o que custaria rodando apenas em horário comercial. Use o recurso de stop/start do AKS ou scaling de node pool.

```bash
# Stop a dev cluster at night (saves 100% compute cost)
az aks stop --resource-group myRG --name dev-cluster

# Or scale down to minimum
az aks nodepool scale \
  --resource-group myRG \
  --cluster-name dev-cluster \
  --name default \
  --node-count 1
```

### 5. Resource requests e limits: acerte nisso

Esta é a coisa mais impactante para eficiência de custos. O scheduler do Kubernetes usa **requests** para empacotar pods nos nodes. Se você solicita 2 CPU mas usa 0.1 CPU, o scheduler acha que aquele slot do node está cheio.

```yaml
resources:
  requests:
    cpu: "100m"      # What you actually use (check with kubectl top)
    memory: "128Mi"
  limits:
    cpu: "500m"      # Burst ceiling
    memory: "256Mi"  # OOMKill boundary
```

:::warning

Definir requests muito altos desperdiça nodes (você paga por capacidade vazia). Defini-los muito baixos causa falhas de agendamento e evictions. Baseie os requests no uso real P95 dos seus dados de monitoramento, não em suposições.
:::

## Medindo uso real vs requests

```bash
# Compare requested vs actual for all pods in a namespace
kubectl top pods -n production --containers

# Use this KQL query in Container Insights to find over-provisioned pods
# Pods requesting >4x their actual CPU usage
Perf
| where ObjectName == "K8SContainer" and CounterName == "cpuUsageNanoCores"
| summarize AvgCPU=avg(CounterValue) by InstanceName
| join kind=inner (
    KubePodInventory | distinct ContainerName, Namespace, PodName
) on $left.InstanceName == $right.ContainerName
```

## Erros comuns

1. **Nunca olhar o custo** -- Times fazem deploy e esquecem. Configure revisões mensais de custo por dono de namespace.
2. **Node pools uniformes** -- Use múltiplos node pools com diferentes tamanhos de VM. Workloads GPU precisam de nodes GPU. Servidores web precisam de nodes general-purpose baratos. Não coloque tudo no mesmo SKU caro.
3. **Ignorar egress** -- Tráfego entre regiões e egress para internet somam. Mantenha serviços na mesma região. Use private endpoints.
4. **Super-alocar PVCs** -- Um SSD Premium de 1 TB custa dinheiro real mesmo se você usa 10 GB. Dimensione PVCs para a necessidade real e use Standard SSD onde os requisitos de IOPS permitirem.
5. **Rodar monitoramento em nodes caros** -- Coloque workloads de observabilidade (Prometheus, agentes de logging) em seu próprio node pool custo-efetivo.

## Checklist de revisão mensal de custos

- [ ] Verificar utilização dos nodes (meta: 60-80% CPU, 60-80% memória)
- [ ] Revisar breakdown de custos por namespace no add-on do AKS
- [ ] Identificar pods com requests > 4x o uso real
- [ ] Verificar se clusters não-prod estão reduzidos fora do horário comercial
- [ ] Verificar PVCs órfãos (volumes persistentes sem pod vinculado)
- [ ] Revisar custos de egress para picos inesperados

## Recursos

- [AKS cost analysis add-on](https://learn.microsoft.com/en-us/azure/aks/cost-analysis)
- [Azure Cost Management](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/overview-cost-management)
- [KubeCost](https://www.kubecost.com/)
- [OpenCost](https://www.opencost.io/)
- [AKS best practices for cost](https://learn.microsoft.com/en-us/azure/aks/best-practices-cost)
- [Spot node pools](https://learn.microsoft.com/en-us/azure/aks/spot-node-pool)
