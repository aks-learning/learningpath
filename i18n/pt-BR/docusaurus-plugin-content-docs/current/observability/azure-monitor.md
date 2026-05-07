---
sidebar_position: 1
title: "Azure Monitor e Container Insights"
description: "Habilite Container Insights em todo cluster AKS. Colete logs, metrics e alertas com Azure Monitor para observabilidade em nível de produção."
---

# Azure Monitor e Container Insights

Habilite Container Insights em todo cluster. Não existe desculpa para voar às cegas. O custo é mínimo comparado a depurar uma falha em produção com zero telemetria. Esta é a base da observabilidade no AKS.

## O que o Container Insights oferece

Container Insights é o agente do Azure Monitor rodando como DaemonSet no seu cluster. Ele coleta:

| Tipo de Dado | O Que Você Recebe | Onde Fica Armazenado |
|-----------|-------------|----------------|
| Metrics de node | CPU, memória, disco, rede por node | Azure Monitor Metrics |
| Metrics de pod | Requests de CPU/memória vs uso real | Azure Monitor Metrics |
| Logs de container | stdout/stderr de todo container | Log Analytics workspace |
| Dados em tempo real | Streaming de logs em tempo real no portal | Stream direto |
| Eventos do Kubernetes | Agendamento de pods, reinícios, falhas | Log Analytics workspace |
| Alertas recomendados | Alertas pré-configurados para falhas comuns | Azure Monitor Alerts |

## Habilitar Container Insights

Use a CLI. Faça isso na criação do cluster ou imediatamente depois.

```bash
# Create a Log Analytics workspace (same region as your cluster)
az monitor log-analytics workspace create \
  --resource-group myRG \
  --workspace-name myAKS-logs \
  --location eastus2

# Enable monitoring addon
az aks enable-addons \
  --resource-group myRG \
  --name myCluster \
  --addons monitoring \
  --workspace-resource-id "/subscriptions/<sub>/resourceGroups/myRG/providers/Microsoft.OperationalInsights/workspaces/myAKS-logs"
```

:::warning

Escolha um Log Analytics workspace na mesma região do seu cluster. Ingestão entre regiões adiciona latência e custo de egress.
:::

## Tiers de log: aqui é onde as pessoas desperdiçam dinheiro

O Log Analytics tem dois tiers. Use-os deliberadamente.

| Tier | Custo | Consulta | Retenção | Usar Para |
|------|------|-------|-----------|---------|
| Basic | ~$0.65/GB ingerido | Limitada (janela de consulta de 8 dias) | Mínimo de 8 dias | Logs de container de alto volume, saída de debug |
| Analytics (Standard) | ~$2.76/GB ingerido | KQL completo, alertas, dashboards | 30-730 dias | Alertas críticos, consultas de SLO, logs de auditoria |

:::tip

Use o tier Basic para logs de container de alto volume. Use o tier Analytics para tabelas que você consulta e alerta ativamente. Não pague preço de Analytics para logs de debug que você consulta uma vez por trimestre.
:::

Configure planos por tabela no portal em Log Analytics workspace > Tables, ou via CLI:

```bash
az monitor log-analytics workspace table update \
  --resource-group myRG \
  --workspace-name myAKS-logs \
  --name ContainerLogV2 \
  --plan Basic
```

## Coleta de syslog

Habilite a coleta de syslog via Data Collection Rules (DCR). Isso captura logs do sistema Linux dos seus nodes -- essencial para diagnosticar problemas no kubelet, containerd e no nível do kernel.

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --enable-syslog \
  --data-collection-settings dcr-settings.json
```

## Consultas KQL que você realmente vai usar

Estas consultas cobrem 90% da resolução de problemas do mundo real:

```kusto
// Pods in CrashLoopBackOff (last 1 hour)
KubePodInventory
| where TimeGenerated > ago(1h)
| where PodStatus == "Failed" or ContainerStatusReason == "CrashLoopBackOff"
| project TimeGenerated, Namespace, PodName, ContainerStatusReason
| order by TimeGenerated desc

// OOMKilled containers (last 24 hours)
KubePodInventory
| where TimeGenerated > ago(24h)
| where ContainerLastStatus contains "OOMKilled"
| project TimeGenerated, Namespace, PodName, ContainerName
| summarize OOMCount=count() by Namespace, PodName

// Node memory pressure
InsightsMetrics
| where TimeGenerated > ago(1h)
| where Name == "memoryRssBytes" and ObjectName == "K8SNode"
| extend UsedGB = Val / (1024*1024*1024)
| summarize AvgMemGB=avg(UsedGB) by NodeName=Tags["hostName"], bin(TimeGenerated, 5m)
| where AvgMemGB > 12  // adjust threshold to your node size
```

## Erros comuns

1. **Não habilitar Container Insights** -- você não consegue obter logs retroativamente de antes da habilitação.
2. **Usar o tier Analytics para tudo** -- um cluster movimentado pode gerar mais de 50 GB/dia de logs de container. Com preço de Analytics, isso dá $130+/dia.
3. **Ignorar alertas recomendados** -- Container Insights vem com regras de alerta pré-configuradas. Habilite-as. Elas detectam OOM, pressão de node e falhas de pod.
4. **Região errada do workspace** -- ingestão entre regiões adiciona latência e custo. Sempre co-localize.

:::info

Container Insights v2 usa a tabela ContainerLogV2 com parsing JSON estruturado. Se você ainda está na tabela legada ContainerLog, migre. O schema v2 é mais barato para consultar e mais fácil de filtrar.
:::

## Decisão: quando usar Container Insights vs Prometheus

| Cenário | Usar Container Insights | Usar Prometheus |
|----------|----------------------|----------------|
| Saúde do cluster | Sim | Também funciona |
| Agregação e busca de logs | Sim | Não (Prometheus é somente metrics) |
| Metrics customizadas de aplicação | Não | Sim |
| Retenção de metrics de longo prazo | Limitado | Melhor com managed Prometheus |
| Alertas em padrões de log | Sim | Não |

Use ambos. Eles são complementares, não concorrentes.

## Recursos

- [Monitor AKS with Azure Monitor](https://learn.microsoft.com/en-us/azure/aks/monitor-aks)
- [Container Insights overview](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-overview)
- [Log Analytics pricing](https://azure.microsoft.com/en-us/pricing/details/monitor/)
- [ContainerLogV2 schema](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-logs-schema)
- [Recommended metric alerts for AKS](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-metric-alerts)
