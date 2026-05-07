---
sidebar_position: 1
title: "Azure Monitor and Container Insights"
description: "Enable Container Insights on every AKS cluster. Collect logs, metrics, and alerts with Azure Monitor for production-grade observability."
---

# Azure Monitor and Container Insights

Enable Container Insights on every cluster. There is no excuse for flying blind. The cost is minimal compared to debugging a production outage with zero telemetry. This is the foundation of AKS observability.

## What Container Insights Gives You

Container Insights is the Azure Monitor agent running as a DaemonSet in your cluster. It collects:

| Data Type | What You Get | Where It Lands |
|-----------|-------------|----------------|
| Node metrics | CPU, memory, disk, network per node | Azure Monitor Metrics |
| Pod metrics | CPU/memory requests vs actual usage | Azure Monitor Metrics |
| Container logs | stdout/stderr from every container | Log Analytics workspace |
| Live data | Real-time log streaming in the portal | Direct stream |
| Kubernetes events | Pod scheduling, restarts, failures | Log Analytics workspace |
| Recommended alerts | Pre-built alerts for common failures | Azure Monitor Alerts |

## Enable Container Insights

Use the CLI. Do this at cluster creation or immediately after.

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

Pick a Log Analytics workspace in the same region as your cluster. Cross-region ingestion adds latency and egress cost.
:::

## Log Tiers: This Is Where People Waste Money

Log Analytics has two tiers. Use them deliberately.

| Tier | Cost | Query | Retention | Use For |
|------|------|-------|-----------|---------|
| Basic | ~$0.65/GB ingested | Limited (8-day query window) | 8 days minimum | High-volume container logs, debug output |
| Analytics (Standard) | ~$2.76/GB ingested | Full KQL, alerts, dashboards | 30-730 days | Critical alerts, SLO queries, audit logs |

:::tip

Use Basic logs tier for high-volume container logs. Use Analytics tier for tables you actively query and alert on. Do not pay Analytics prices for debug logs you query once a quarter.
:::

Configure table-level plans in the portal under Log Analytics workspace > Tables, or via CLI:

```bash
az monitor log-analytics workspace table update \
  --resource-group myRG \
  --workspace-name myAKS-logs \
  --name ContainerLogV2 \
  --plan Basic
```

## Syslog Collection

Enable syslog collection via Data Collection Rules (DCR). This captures Linux system logs from your nodes -- essential for diagnosing kubelet, containerd, and kernel-level issues.

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --enable-syslog \
  --data-collection-settings dcr-settings.json
```

## KQL Queries You Will Actually Use

These queries cover 90% of real-world troubleshooting:

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

## Common Mistakes

1. **Not enabling Container Insights at all** -- you cannot retroactively get logs from before you enabled it.
2. **Using Analytics tier for everything** -- a busy cluster can generate 50+ GB/day of container logs. At Analytics pricing, that is $130+/day.
3. **Ignoring recommended alerts** -- Container Insights comes with pre-built alert rules. Enable them. They catch OOM, node pressure, and pod failures.
4. **Wrong workspace region** -- cross-region ingestion adds latency and cost. Always co-locate.

:::info

Container Insights v2 uses ContainerLogV2 table with structured JSON parsing. If you are still on the legacy ContainerLog table, migrate. The v2 schema is cheaper to query and easier to filter.
:::

## Decision: When to Use Container Insights vs Prometheus

| Scenario | Use Container Insights | Use Prometheus |
|----------|----------------------|----------------|
| Cluster-level health | Yes | Also fine |
| Log aggregation and search | Yes | No (Prometheus is metrics-only) |
| Custom app metrics | No | Yes |
| Long-term metrics retention | Limited | Better with managed Prometheus |
| Alerting on log patterns | Yes | No |

Use both. They are complementary, not competing.

## Resources

- [Monitor AKS with Azure Monitor](https://learn.microsoft.com/en-us/azure/aks/monitor-aks)
- [Container Insights overview](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-overview)
- [Log Analytics pricing](https://azure.microsoft.com/en-us/pricing/details/monitor/)
- [ContainerLogV2 schema](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-logs-schema)
- [Recommended metric alerts for AKS](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-metric-alerts)
