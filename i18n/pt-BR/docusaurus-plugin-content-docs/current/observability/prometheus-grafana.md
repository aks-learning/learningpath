---
sidebar_position: 2
title: "Managed Prometheus e Grafana"
description: "Use Azure Managed Prometheus e Grafana para metrics. Pare de hospedar Prometheus por conta própria -- é um trabalho em tempo integral que você não precisa."
---

# Managed Prometheus e Grafana

Use managed Prometheus. Não hospede Prometheus por conta própria no seu cluster. Prometheus auto-hospedado é um trabalho em tempo integral: você é responsável pelo dimensionamento de storage, alta disponibilidade, políticas de retenção, upgrades e recuperação de desastres. O Azure Managed Prometheus cuida de tudo isso para você com um único comando.

## Por que managed ao invés de auto-hospedado

| Preocupação | Prometheus Auto-Hospedado | Azure Managed Prometheus |
|---------|----------------------|--------------------------|
| Storage | Você gerencia PVCs, lida com pressão de disco | Gerenciado, auto-scaling |
| Alta disponibilidade | Você configura Thanos/Cortex ou aceita ponto único de falha | Integrado |
| Retenção | Limitada por disco; você gerencia compactação | 18 meses padrão |
| Upgrades | Você faz; breaking changes acontecem | Azure cuida |
| Multi-cluster | Configuração complexa de federação | Suporte nativo multi-cluster |
| Custo | "Gratuito" mas consome tempo de engenheiro | Pague por metrics ingeridas |

Grafana auto-hospedado no cluster só se justifica se você tem 50+ clusters e precisa de federação avançada com data sources customizados. Para todos os demais, use Azure Managed Grafana.

## Habilitar Managed Prometheus

Um comando. Faça isso em todo cluster.

```bash
# Enable Azure Monitor metrics (managed Prometheus)
az aks update \
  --resource-group myRG \
  --name myCluster \
  --enable-azure-monitor-metrics \
  --azure-monitor-workspace-resource-id "/subscriptions/<sub>/resourceGroups/myRG/providers/Microsoft.Monitor/accounts/myPrometheusWorkspace"
```

Ou habilite na criação do cluster:

```bash
az aks create \
  --resource-group myRG \
  --name myCluster \
  --enable-azure-monitor-metrics \
  --azure-monitor-workspace-resource-id "/subscriptions/<sub>/resourceGroups/myRG/providers/Microsoft.Monitor/accounts/myPrometheusWorkspace" \
  --grafana-resource-id "/subscriptions/<sub>/resourceGroups/myRG/providers/Microsoft.Dashboard/grafana/myGrafana"
```

:::tip

Crie o Azure Monitor workspace e a instância de Managed Grafana primeiro, depois vincule-os aos seus clusters. Uma instância de Grafana pode visualizar metrics de múltiplos clusters.
:::

## Azure Managed Grafana

O que você recebe pronto:

- Dashboards AKS pré-configurados (visões de node, pod, namespace, workload)
- Autenticação via Entra ID (sem gerenciamento separado de usuários)
- Workspace compartilhado para o seu time
- Upgrades e disponibilidade gerenciados
- Integração nativa com Azure Monitor e Managed Prometheus

```bash
# Create a Managed Grafana instance
az grafana create \
  --resource-group myRG \
  --name myGrafana \
  --location eastus2

# Link it to your Prometheus workspace
az grafana data-source create \
  --resource-group myRG \
  --name myGrafana \
  --definition '{
    "name": "Azure Managed Prometheus",
    "type": "prometheus",
    "url": "https://myPrometheusWorkspace.eastus2.prometheus.monitor.azure.com"
  }'
```

## Metrics customizadas de aplicação

Suas aplicações expõem metrics do Prometheus. O Managed Prometheus as coleta via PodMonitor ou ServiceMonitor CRDs.

```yaml
# ServiceMonitor for a custom application
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-app-metrics
  namespace: production
spec:
  selector:
    matchLabels:
      app: my-api
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics
  namespaceSelector:
    matchNames:
      - production
```

```yaml
# PodMonitor (when your pods don't have a Service)
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: batch-job-metrics
  namespace: batch
spec:
  selector:
    matchLabels:
      app: data-processor
  podMetricsEndpoints:
    - port: metrics
      interval: 60s
```

:::warning

Se o seu ServiceMonitor não está coletando, verifique esses problemas comuns: (1) os labels do selector não correspondem ao Service, (2) o nome da porta não corresponde ao nome da porta do Service, (3) o namespace selector está errado. Use `kubectl get servicemonitors -A` para verificar se eles existem.
:::

## Alertas com Prometheus rules

Defina recording rules (pré-compute de consultas custosas) e regras de alerta via Azure Monitor:

```bash
# Create a Prometheus rule group
az monitor account rule-group create \
  --resource-group myRG \
  --account-name myPrometheusWorkspace \
  --rule-group-name "aks-critical-alerts" \
  --interval "PT1M" \
  --rules '[
    {
      "alert": "HighPodRestartRate",
      "expression": "rate(kube_pod_container_status_restarts_total[15m]) > 0.5",
      "for": "PT5M",
      "severity": 2,
      "annotations": {
        "summary": "Pod {{ $labels.pod }} restarting frequently"
      }
    }
  ]'
```

## O que monitorar: o essencial

| Metric | PromQL | Threshold de Alerta |
|--------|--------|-----------------|
| Taxa de reinício de pod | `rate(kube_pod_container_status_restarts_total[15m])` | > 0.5 por 5 min |
| Saturação de CPU do node | `node_cpu_seconds_total{mode="idle"}` | < 10% idle por 10 min |
| Pressão de memória | `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes` | < 15% por 5 min |
| Uso de PVC | `kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes` | > 85% |
| Latência do API server | `apiserver_request_duration_seconds_bucket` | P99 > 1s |

## Erros comuns

1. **Não criar ServiceMonitors** -- Managed Prometheus só coleta o que você mandar. Os targets padrão cobrem kube-state-metrics e node-exporter. As metrics da sua aplicação precisam de configuração explícita.
2. **Coletar com frequência excessiva** -- Intervalos de 15-30s são suficientes. Intervalos de 5s para 100 pods vão gerar cardinalidade massiva e custo.
3. **Labels de alta cardinalidade** -- Nunca coloque IDs de request, IDs de usuário ou timestamps como labels de metrics. Isso explode o seu storage de metrics.
4. **Ignorar recording rules** -- Se uma consulta de dashboard leva mais de 10 segundos, crie uma recording rule. Pré-compute.

:::info

Azure Managed Prometheus cobra por metrics ingeridas (samples/minuto). Monitore seu volume de ingestão nas metrics do Azure Monitor workspace. Um cluster AKS típico com 50 pods gera 500K-2M samples/minuto.
:::

## Decisão: eu preciso de Container Insights e Prometheus?

Sim. Use Container Insights para logs e metrics básicas de infraestrutura. Use Managed Prometheus para metrics customizadas de aplicação, alertas baseados em PromQL e dashboards no Grafana. Eles servem propósitos diferentes.

## Recursos

- [Azure Managed Prometheus overview](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/prometheus-metrics-overview)
- [Azure Managed Grafana](https://learn.microsoft.com/en-us/azure/managed-grafana/overview)
- [Configure Prometheus scraping](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/prometheus-metrics-scrape-configuration)
- [Prometheus rule groups](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/prometheus-rule-groups)
- [ServiceMonitor CRD reference](https://prometheus-operator.dev/docs/api-reference/api/#monitoring.coreos.com/v1.ServiceMonitor)
