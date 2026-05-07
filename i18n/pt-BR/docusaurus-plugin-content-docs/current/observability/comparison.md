---
sidebar_position: 4
title: "Comparação de observabilidade"
description: "Container Insights vs Managed Prometheus vs OpenTelemetry: quando usar cada um, como se sobrepõem e a stack recomendada."
---

# Comparação de observabilidade

O AKS possui três caminhos de observabilidade que se sobrepõem de maneira confusa. Esta página esclarece o que cada um faz, onde se sobrepõem e qual combinação realmente usar.

## As três ferramentas

| Ferramenta | O que é | Como funciona |
|---|---|---|
| **Container Insights** | Agente do Azure Monitor que coleta logs, métricas de nó/pod e eventos do Kubernetes | DaemonSet implantado via addon de monitoramento |
| **Managed Prometheus** | Armazenamento de métricas compatível com Prometheus hospedado no Azure com scraping pré-configurado | Addon de métricas implantado como DaemonSet, dados armazenados no Azure Monitor workspace |
| **OpenTelemetry** | SDK e collector agnóstico de fornecedor para traces, métricas e logs | Você implanta o OTel Collector e instrumenta o código do seu aplicativo |

---

## Comparação completa

| Aspecto | Container Insights | Managed Prometheus | OpenTelemetry |
|---|---|---|---|
| **Dados primários** | Logs + eventos do Kubernetes | Métricas (séries temporais) | Traces + métricas customizadas + logs |
| **Backend de armazenamento** | Log Analytics workspace | Azure Monitor workspace (compatível com Prometheus) | Depende do exporter (Azure Monitor, Jaeger, Zipkin) |
| **Dashboards** | Workbooks do portal Azure | Azure Managed Grafana | Grafana, Jaeger UI ou qualquer backend compatível |
| **Alertas** | Alertas do Azure Monitor em consultas de log | Regras de alerta Prometheus no Grafana | Depende do backend |
| **Métricas customizadas** | Limitado (consultas de log customizadas via KQL) | Suporte completo a PromQL, scrape de qualquer endpoint `/metrics` | Instrumentação completa via SDK no código do seu aplicativo |
| **Métricas de infraestrutura** | CPU, memória, disco, rede dos nós | O mesmo mais métricas de qualquer exporter Prometheus | Não projetado para métricas de infraestrutura |
| **Dados a nível de aplicação** | Apenas logs stdout/stderr | Métricas do aplicativo se expostas via `/metrics` | Traces distribuídos, spans customizados, métricas do aplicativo |
| **Modelo de custo** | Pago por GB de logs ingeridos no Log Analytics | Pago por amostras de métricas ingeridas | Gratuito (SDK é open source), pago pelo backend para o qual exporta |
| **Esforço de configuração** | Um comando CLI | Um comando CLI + Grafana workspace | Implantar collector, instrumentar código, configurar exporters |
| **Quando usar** | Sempre (observabilidade básica) | Quando precisar de métricas além do portal | Quando precisar de tracing distribuído ou instrumentação customizada |

---

## A stack recomendada

Use as três. Cada uma cobre uma camada que as outras não conseguem.

| Camada | Ferramenta | Por quê |
|---|---|---|
| Logs e eventos do Kubernetes | Container Insights | Captura stdout/stderr de cada container mais eventos de agendamento. Este é seu rastro de auditoria. |
| Métricas e dashboards | Managed Prometheus + Grafana | PromQL é o padrão para métricas. Dashboards do Grafana são melhores que workbooks do portal Azure. Dashboards da comunidade funcionam imediatamente. |
| Tracing distribuído | OpenTelemetry | A única opção para rastreamento a nível de requisição entre microsserviços. Container Insights e Prometheus não fazem isso. |

### Habilite a stack recomendada

```bash
# 1. Container Insights (logs + events)
az aks enable-addons \
  --resource-group myRG \
  --name myCluster \
  --addons monitoring \
  --workspace-resource-id "<log-analytics-workspace-id>"

# 2. Managed Prometheus (metrics)
az aks update \
  --resource-group myRG \
  --name myCluster \
  --enable-azure-monitor-metrics \
  --azure-monitor-workspace-resource-id "<azure-monitor-workspace-id>" \
  --grafana-resource-id "<grafana-workspace-id>"

# 3. OpenTelemetry Collector (tracing)
# Deploy via Helm or the OTel Operator in your cluster
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm install otel-collector open-telemetry/opentelemetry-collector \
  --namespace otel-system --create-namespace \
  --set mode=deployment \
  --set config.exporters.azuremonitor.connection_string="<app-insights-connection-string>"
```

---

## O que se sobrepõe e o que não

Container Insights e Managed Prometheus coletam métricas de nó e pod. Isso causa confusão.

| Tipo de métrica | Container Insights | Managed Prometheus | Sobreposição? |
|---|---|---|---|
| CPU/memória do nó | Sim (enviado ao Log Analytics) | Sim (enviado ao Azure Monitor workspace) | Sim, duplicado |
| CPU/memória do pod | Sim | Sim | Sim, duplicado |
| Contagem de reinicializações do container | Sim | Sim | Sim, duplicado |
| Eventos do Kubernetes | Sim | Não | Sem sobreposição |
| Logs de container (stdout/stderr) | Sim | Não | Sem sobreposição |
| Métricas customizadas do aplicativo | Não | Sim (se o app expõe `/metrics`) | Sem sobreposição |
| Consultas PromQL | Não | Sim | Sem sobreposição |
| Traces distribuídos | Não | Não | Nenhum cobre isso |

:::info

A duplicação de métricas entre Container Insights e Managed Prometheus é intencional. Container Insights alimenta a experiência do portal Azure. Managed Prometheus alimenta o Grafana. Você paga por ambos, mas o caminho do Prometheus é significativamente mais barato para cargas de trabalho puramente de métricas. Se o custo é uma preocupação, reduza o Container Insights para apenas logs e use Prometheus para todas as métricas.

:::

---

## Considerações de custo

Os custos de observabilidade são impulsionados pelo volume de dados. Sem filtros, um cluster de 20 nós pode gerar mais de 50 GB de logs por dia.

### Para onde vai o dinheiro

| Fonte | Driver de custo | Impacto típico |
|---|---|---|
| Logs do Container Insights | GB ingeridos no Log Analytics | Alto. Este é o componente mais caro. |
| Métricas do Container Insights | Incluído com o addon de logs | Moderado. Incluído, mas ainda medido. |
| Managed Prometheus | Amostras de métricas ingeridas | Baixo. Prometheus é muito eficiente para dados de séries temporais. |
| Managed Grafana | Preço por instância | Fixo. Uma instância do Grafana atende toda a equipe. |
| OpenTelemetry | Depende do backend | Variável. Application Insights cobra por evento. |

### Reduza o volume de logs imediatamente

Não colete tudo. Filtre agressivamente desde o primeiro dia.

```yaml
# ConfigMap to exclude noisy namespaces from Container Insights
# Apply as: kubectl apply -f container-insights-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: container-azm-ms-agentconfig
  namespace: kube-system
data:
  schema-version: v1
  config-version: v1
  log-data-collection-settings: |-
    [log_collection_settings]
      [log_collection_settings.stdout]
        enabled = true
        exclude_namespaces = ["kube-system","gatekeeper-system","azure-arc"]
      [log_collection_settings.stderr]
        enabled = true
        exclude_namespaces = ["kube-system","gatekeeper-system"]
      [log_collection_settings.env_var]
        enabled = false
```

:::tip

Comece excluindo os logs de `kube-system`. Eles são de alto volume e raramente úteis para depuração de aplicativos. Se precisar de dados de kube-system, consulte-os através dos eventos do Kubernetes no Container Insights em vez de logs brutos de container.

:::

### Comparação de custos em escala

| Tamanho do cluster | Container Insights (logs + métricas) | Apenas Managed Prometheus | Economia com Prometheus para métricas |
|---|---|---|---|
| 5 nós, cargas leves | ~$150/mês | ~$30/mês | 80% no custo de métricas |
| 20 nós, cargas moderadas | ~$800/mês | ~$80/mês | 90% no custo de métricas |
| 50+ nós, cargas pesadas | ~$3.000+/mês | ~$150/mês | 95% no custo de métricas |

Estes são estimativas. Os custos reais dependem do volume de logs, retenção e frequência de consultas.

---

## Caminho de migração

Não tente configurar tudo de uma vez. Siga esta ordem:

### Fase 1: apenas Container Insights

Habilite o Container Insights. Faça os logs, métricas básicas e dashboards do portal funcionarem. Isso leva 10 minutos e cobre 80% do que você precisa no primeiro dia.

### Fase 2: adicione Managed Prometheus e Grafana

Quando precisar de dashboards melhores, métricas customizadas ou alertas via PromQL, adicione o Managed Prometheus. Importe dashboards comunitários do Grafana para Kubernetes. Considere reduzir o Container Insights para apenas logs para evitar pagar por métricas duplicadas.

### Fase 3: adicione OpenTelemetry

Quando tiver múltiplos microsserviços e precisar rastrear requisições entre eles, instrumente seu aplicativo com o SDK OpenTelemetry. Implante o OTel Collector para exportar traces para o Application Insights ou Jaeger.

:::info

A maioria das equipes nunca precisa da fase 3. Se você executa um monólito ou um número pequeno de serviços, tracing distribuído adiciona complexidade sem valor proporcional. Adicione-o quando não conseguir depurar problemas de latência entre serviços apenas com logs e métricas.

:::

---

## Anti-padrões

Evite estes erros comuns.

| Anti-padrão | Por que está errado | O que fazer em vez disso |
|---|---|---|
| Executar Prometheus auto-hospedado junto com Managed Prometheus | Dobro da carga operacional, dobro do custo, dados em dois lugares | Use Managed Prometheus. É totalmente compatível e o Azure cuida da disponibilidade. |
| Coletar todos os logs de todos os namespaces sem filtragem | Os custos do Log Analytics escalam linearmente com o volume. Você vai ter uma surpresa na fatura. | Exclua `kube-system`, `gatekeeper-system` e qualquer outro namespace de infraestrutura que não precise. |
| Usar Container Insights para alertas de métricas | Alertas de métricas baseados em KQL têm maior latência e custam mais que regras de alerta Prometheus | Use recording rules do Prometheus e alertas do Grafana para métricas. Use alertas do Container Insights apenas para condições baseadas em logs. |
| Implantar Jaeger, Zipkin e Application Insights simultaneamente | Três backends de tracing significam três lugares para procurar e nenhum deles tem dados completos | Escolha um backend de tracing. Application Insights se integra nativamente com o Azure. Jaeger é melhor se quiser permanecer agnóstico de fornecedor. |
| Não definir limites de recursos no OTel Collector | O collector pode consumir memória ilimitada durante picos de tráfego | Sempre defina limites de memória no pod do collector e configure o processador de limitação de memória no pipeline OTel |

---

## Árvore de decisão: qual ferramenta preciso agora?

**Pergunta 1: Você tem alguma observabilidade neste cluster?**
- Não: Habilite o Container Insights. Pare aqui até ter uma necessidade real para mais.

**Pergunta 2: Você precisa de dashboards melhores ou alertas de métricas customizadas?**
- Sim: Adicione Managed Prometheus + Grafana.

**Pergunta 3: Você está depurando latência entre múltiplos serviços?**
- Sim: Adicione OpenTelemetry com tracing distribuído.

**Pergunta 4: Sua fatura do Container Insights está muito alta?**
- Sim: Filtre a coleta de logs, mude métricas para Prometheus, reduza a retenção do Log Analytics para 30 dias.

---

## Recursos

- [Container Insights overview](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-overview)
- [Enable Container Insights for AKS](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-enable-aks)
- [Azure Monitor managed service for Prometheus](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/prometheus-metrics-overview)
- [Enable Prometheus metrics collection on AKS](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/kubernetes-monitoring-enable)
- [Azure Managed Grafana](https://learn.microsoft.com/en-us/azure/managed-grafana/overview)
- [OpenTelemetry with Azure Monitor](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-enable)
- [Configure Container Insights data collection](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-data-collection-configure)
- [Cost optimization for Container Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-cost)
