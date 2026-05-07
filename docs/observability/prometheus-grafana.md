---
sidebar_position: 2
title: "Managed Prometheus and Grafana"
description: "Use Azure Managed Prometheus and Grafana for metrics. Stop self-hosting Prometheus -- it's a full-time job you don't need."
---

# Managed Prometheus and Grafana

Use managed Prometheus. Do not self-host Prometheus in your cluster. Self-hosted Prometheus is a full-time job: you own the storage sizing, high-availability, retention policies, upgrades, and disaster recovery. Azure Managed Prometheus handles all of that for you with a single command.

## Why managed over self-hosted

| Concern | Self-Hosted Prometheus | Azure Managed Prometheus |
|---------|----------------------|--------------------------|
| Storage | You manage PVCs, deal with disk pressure | Managed, auto-scaling |
| High availability | You configure Thanos/Cortex or accept SPOF | Built-in |
| Retention | Limited by disk; you manage compaction | 18 months default |
| Upgrades | You do them; breaking changes happen | Azure handles it |
| Multi-cluster | Complex federation setup | Native multi-cluster support |
| Cost | "Free" but burns engineer time | Pay per metrics ingested |

Self-hosted Grafana in the cluster is only justified if you have 50+ clusters and need advanced federation with custom data sources. For everyone else, use Azure Managed Grafana.

## Enable Managed Prometheus

One command. Do this on every cluster.

```bash
# Enable Azure Monitor metrics (managed Prometheus)
az aks update \
  --resource-group myRG \
  --name myCluster \
  --enable-azure-monitor-metrics \
  --azure-monitor-workspace-resource-id "/subscriptions/<sub>/resourceGroups/myRG/providers/Microsoft.Monitor/accounts/myPrometheusWorkspace"
```

Or enable at cluster creation:

```bash
az aks create \
  --resource-group myRG \
  --name myCluster \
  --enable-azure-monitor-metrics \
  --azure-monitor-workspace-resource-id "/subscriptions/<sub>/resourceGroups/myRG/providers/Microsoft.Monitor/accounts/myPrometheusWorkspace" \
  --grafana-resource-id "/subscriptions/<sub>/resourceGroups/myRG/providers/Microsoft.Dashboard/grafana/myGrafana"
```

:::tip

Create the Azure Monitor workspace and Managed Grafana instance first, then link them to your clusters. One Grafana instance can visualize metrics from multiple clusters.
:::

## Azure Managed Grafana

What you get out of the box:

- Pre-built AKS dashboards (node, pod, namespace, workload views)
- Entra ID authentication (no separate user management)
- Shared workspace for your team
- Managed upgrades and availability
- Native integration with Azure Monitor and Managed Prometheus

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

## Custom application metrics

Your apps expose Prometheus metrics. Managed Prometheus scrapes them via PodMonitor or ServiceMonitor CRDs.

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

If your ServiceMonitor is not scraping, check these common issues: (1) the selector labels do not match the Service, (2) the port name does not match the Service port name, (3) the namespace selector is wrong. Use `kubectl get servicemonitors -A` to verify they exist.
:::

## Alerting with Prometheus rules

Define recording rules (pre-compute expensive queries) and alert rules via Azure Monitor:

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

## What to monitor: the essentials

| Metric | PromQL | Alert Threshold |
|--------|--------|-----------------|
| Pod restart rate | `rate(kube_pod_container_status_restarts_total[15m])` | > 0.5 for 5 min |
| Node CPU saturation | `node_cpu_seconds_total{mode="idle"}` | < 10% idle for 10 min |
| Memory pressure | `node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes` | < 15% for 5 min |
| PVC usage | `kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes` | > 85% |
| API server latency | `apiserver_request_duration_seconds_bucket` | P99 > 1s |

## Common mistakes

1. **Not creating ServiceMonitors** -- Managed Prometheus only scrapes what you tell it to. Default targets cover kube-state-metrics and node-exporter. Your app metrics need explicit configuration.
2. **Scraping too frequently** -- 15-30s intervals are fine. 5s intervals for 100 pods will generate massive cardinality and cost.
3. **High cardinality labels** -- Never put request IDs, user IDs, or timestamps as metric labels. This explodes your metrics storage.
4. **Ignoring recording rules** -- If a dashboard query takes 10+ seconds, create a recording rule. Pre-compute it.

:::info

Azure Managed Prometheus charges per metrics ingested (samples/minute). Monitor your ingestion volume in the Azure Monitor workspace metrics. A typical AKS cluster with 50 pods generates 500K-2M samples/minute.
:::

## Decision: do I need both Container Insights and Prometheus?

Yes. Use Container Insights for logs and basic infrastructure metrics. Use Managed Prometheus for custom application metrics, PromQL-based alerting, and Grafana dashboards. They serve different purposes.

## Resources

- [Azure Managed Prometheus overview](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/prometheus-metrics-overview)
- [Azure Managed Grafana](https://learn.microsoft.com/en-us/azure/managed-grafana/overview)
- [Configure Prometheus scraping](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/prometheus-metrics-scrape-configuration)
- [Prometheus rule groups](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/prometheus-rule-groups)
- [ServiceMonitor CRD reference](https://prometheus-operator.dev/docs/api-reference/api/#monitoring.coreos.com/v1.ServiceMonitor)
