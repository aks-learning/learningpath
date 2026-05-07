---
sidebar_position: 4
title: "Observability comparison"
description: "Container Insights vs Managed Prometheus vs OpenTelemetry: when to use each, how they overlap, and the recommended stack."
---

# Observability comparison

AKS has three observability paths that overlap in confusing ways. This page clarifies what each one does, where they overlap, and what combination to actually use.

## The three tools

| Tool | What it is | How it runs |
|---|---|---|
| **Container Insights** | Azure Monitor agent that collects logs, node/pod metrics, and Kubernetes events | DaemonSet deployed via the monitoring addon |
| **Managed Prometheus** | Azure-hosted Prometheus-compatible metrics store with pre-built scraping | Metrics addon deployed as a DaemonSet, data stored in Azure Monitor workspace |
| **OpenTelemetry** | Vendor-neutral SDK and collector for traces, metrics, and logs | You deploy the OTel Collector and instrument your application code |

---

## Full comparison

| Aspect | Container Insights | Managed Prometheus | OpenTelemetry |
|---|---|---|---|
| **Primary data** | Logs + Kubernetes events | Metrics (time series) | Traces + custom metrics + logs |
| **Storage backend** | Log Analytics workspace | Azure Monitor workspace (Prometheus-compatible) | Depends on exporter (Azure Monitor, Jaeger, Zipkin) |
| **Dashboards** | Azure portal workbooks | Azure Managed Grafana | Grafana, Jaeger UI, or any compatible backend |
| **Alerting** | Azure Monitor alerts on log queries | Prometheus alert rules in Grafana | Depends on backend |
| **Custom metrics** | Limited (custom log queries via KQL) | Full PromQL support, scrape any `/metrics` endpoint | Full SDK instrumentation in your application code |
| **Infrastructure metrics** | Node CPU, memory, disk, network | Same plus any Prometheus exporter metrics | Not designed for infrastructure metrics |
| **Application-level data** | stdout/stderr logs only | Application metrics if exposed via `/metrics` | Distributed traces, custom spans, application metrics |
| **Cost model** | Pay per GB of logs ingested into Log Analytics | Pay per metrics samples ingested | Free (SDK is open source), pay for the backend you export to |
| **Setup effort** | One CLI command | One CLI command + Grafana workspace | Deploy collector, instrument code, configure exporters |
| **When to use** | Always (baseline observability) | When you need metrics beyond the portal | When you need distributed tracing or custom instrumentation |

---

## The recommended stack

Use all three. Each covers a layer the others cannot.

| Layer | Tool | Why |
|---|---|---|
| Logs and Kubernetes events | Container Insights | Captures stdout/stderr from every container plus scheduling events. This is your audit trail. |
| Metrics and dashboards | Managed Prometheus + Grafana | PromQL is the standard for metrics. Grafana dashboards are better than Azure portal workbooks. Community dashboards work out of the box. |
| Distributed tracing | OpenTelemetry | The only option for request-level tracing across microservices. Container Insights and Prometheus cannot do this. |

### Enable the recommended stack

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

## What overlaps and what does not

Container Insights and Managed Prometheus both collect node and pod metrics. This causes confusion.

| Metric type | Container Insights | Managed Prometheus | Overlap? |
|---|---|---|---|
| Node CPU/memory | Yes (sent to Log Analytics) | Yes (sent to Azure Monitor workspace) | Yes, duplicate |
| Pod CPU/memory | Yes | Yes | Yes, duplicate |
| Container restart count | Yes | Yes | Yes, duplicate |
| Kubernetes events | Yes | No | No overlap |
| Container logs (stdout/stderr) | Yes | No | No overlap |
| Custom application metrics | No | Yes (if app exposes `/metrics`) | No overlap |
| PromQL queries | No | Yes | No overlap |
| Distributed traces | No | No | Neither covers this |

:::info

The metric duplication between Container Insights and Managed Prometheus is intentional. Container Insights feeds the Azure portal experience. Managed Prometheus feeds Grafana. You pay for both, but the Prometheus path is significantly cheaper for pure metrics workloads. If cost is a concern, reduce Container Insights to logs-only and use Prometheus for all metrics.

:::

---

## Cost considerations

Observability costs are driven by data volume. Unfiltered, a 20-node cluster can generate 50+ GB of logs per day.

### Where the money goes

| Source | Cost driver | Typical impact |
|---|---|---|
| Container Insights logs | GB ingested into Log Analytics | High. This is the most expensive component. |
| Container Insights metrics | Included with logs addon | Moderate. Bundled, but still metered. |
| Managed Prometheus | Metrics samples ingested | Low. Prometheus is very efficient for time-series data. |
| Managed Grafana | Per-instance pricing | Fixed. One Grafana instance serves the whole team. |
| OpenTelemetry | Depends on the backend | Variable. Application Insights charges per event. |

### Reduce log volume immediately

Do not collect everything. Filter aggressively from day one.

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

Start by excluding `kube-system` logs. These are high-volume and rarely useful for application debugging. If you need kube-system data, query it through Kubernetes events in Container Insights instead of raw container logs.

:::

### Cost comparison at scale

| Cluster size | Container Insights (logs + metrics) | Managed Prometheus only | Savings with Prometheus for metrics |
|---|---|---|---|
| 5 nodes, light workloads | ~$150/month | ~$30/month | 80% on metrics cost |
| 20 nodes, moderate workloads | ~$800/month | ~$80/month | 90% on metrics cost |
| 50+ nodes, heavy workloads | ~$3,000+/month | ~$150/month | 95% on metrics cost |

These are estimates. Actual costs depend on log volume, retention, and query frequency.

---

## Migration path

Do not try to set up everything at once. Follow this order:

### Phase 1: Container Insights only

Enable Container Insights. Get logs, basic metrics, and portal dashboards working. This takes 10 minutes and covers 80% of what you need on day one.

### Phase 2: Add Managed Prometheus and Grafana

When you need better dashboards, custom metrics, or PromQL alerting, add Managed Prometheus. Import community Grafana dashboards for Kubernetes. Consider reducing Container Insights to logs-only to avoid paying for duplicate metrics.

### Phase 3: Add OpenTelemetry

When you have multiple microservices and need to trace requests across them, instrument your application with the OpenTelemetry SDK. Deploy the OTel Collector to export traces to Application Insights or Jaeger.

:::info

Most teams never need phase 3. If you run a monolith or a small number of services, distributed tracing adds complexity without proportional value. Add it when you cannot debug cross-service latency issues with logs and metrics alone.

:::

---

## Anti-patterns

Avoid these common mistakes.

| Anti-pattern | Why it is wrong | What to do instead |
|---|---|---|
| Running self-hosted Prometheus alongside Managed Prometheus | Double the operational burden, double the cost, data in two places | Use Managed Prometheus. It is fully compatible and Azure handles availability. |
| Collecting all logs from all namespaces without filtering | Log Analytics costs scale linearly with volume. You will get a surprise bill. | Exclude `kube-system`, `gatekeeper-system`, and any other infrastructure namespace you do not need. |
| Using Container Insights for metrics alerting | KQL-based metric alerts have higher latency and cost more than Prometheus alert rules | Use Prometheus recording rules and Grafana alerts for metrics. Use Container Insights alerts only for log-based conditions. |
| Deploying Jaeger, Zipkin, and Application Insights simultaneously | Three tracing backends means three places to look and none of them have complete data | Pick one tracing backend. Application Insights integrates natively with Azure. Jaeger is better if you want to stay vendor-neutral. |
| Skipping resource limits on the OTel Collector | The collector can consume unbounded memory during traffic spikes | Always set memory limits on the collector pod and configure the memory limiter processor in the OTel pipeline |

---

## Decision tree: which tool do I need right now?

**Question 1: Do you have any observability on this cluster?**
- No: Enable Container Insights. Stop here until you have a real need for more.

**Question 2: Do you need better dashboards or custom metrics alerting?**
- Yes: Add Managed Prometheus + Grafana.

**Question 3: Are you debugging latency across multiple services?**
- Yes: Add OpenTelemetry with distributed tracing.

**Question 4: Is your Container Insights bill too high?**
- Yes: Filter log collection, switch metrics to Prometheus, reduce Log Analytics retention to 30 days.

---

## Resources

- [Container Insights overview](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-overview)
- [Enable Container Insights for AKS](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-enable-aks)
- [Azure Monitor managed service for Prometheus](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/prometheus-metrics-overview)
- [Enable Prometheus metrics collection on AKS](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/kubernetes-monitoring-enable)
- [Azure Managed Grafana](https://learn.microsoft.com/en-us/azure/managed-grafana/overview)
- [OpenTelemetry with Azure Monitor](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-enable)
- [Configure Container Insights data collection](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-data-collection-configure)
- [Cost optimization for Container Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-cost)
