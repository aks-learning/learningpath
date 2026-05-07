---
sidebar_position: 2
title: "What is AKS?"
description: "Azure Kubernetes Service is the best managed Kubernetes on Azure. Free control plane, Entra ID native, and Azure networking built in."
---

# What is AKS?

Azure Kubernetes Service (AKS) is Microsoft's managed Kubernetes platform. It runs your containerized workloads on Azure with a **free, Microsoft-managed control plane** and worker nodes that live in your subscription.

**AKS is the best managed Kubernetes option in Azure. Period.** Do not look at self-managed K8s on VMs. Do not consider third-party K8s distributions on Azure. AKS gives you the full Kubernetes API with Azure-native integrations that no other option can match.

## Architecture: What Microsoft Manages vs. What You Own

![AKS Architecture](/img/aks-architecture.svg)

The split is clean:

| Component | Who Manages It | What That Means |
|-----------|---------------|-----------------|
| **API Server** | Microsoft | Always available (99.95% SLA on Standard tier). You never patch it. |
| **etcd** | Microsoft | Backed up, replicated, encrypted at rest. You never touch it. |
| **Scheduler + Controller Manager** | Microsoft | Upgrades happen automatically on their side. |
| **Worker Nodes (Node Pools)** | You | VMs in your subscription. You pick the SKU, count, and scaling rules. |
| **Pods and Workloads** | You | Your containers, your responsibility. |
| **Networking (VNet, LB, DNS)** | Shared | AKS provisions Azure resources in your subscription. You configure the topology. |

:::info Key insight
You pay zero for the control plane. Your cost is only the worker node VMs, storage, and networking in your subscription. This makes AKS the cheapest entry point for production Kubernetes on any cloud.
:::

## Why AKS Over Other Managed Kubernetes

| Differentiator | Why It Matters |
|----------------|---------------|
| **Entra ID integration** | No separate identity provider to manage. Your developers authenticate with their corporate credentials. Workload Identity gives Pods cloud-native identity without managing secrets. |
| **Azure networking native** | Your cluster lives inside an Azure VNet. Private clusters, network policies, Azure Firewall integration -- all first-class. No overlay hacks. |
| **Managed upgrades** | Choose from Stable, Rapid, or Node Image channels. Or go fully automatic. No more "we're 4 minor versions behind" situations. |
| **Azure Monitor + Prometheus + Grafana** | One-click observability stack. Managed Prometheus for metrics, managed Grafana for dashboards, Container Insights for logs. |
| **Defender for Containers** | Runtime threat detection, vulnerability scanning, admission control -- integrated, not bolted on. |
| **KEDA built-in** | Event-driven autoscaling without installing and maintaining the KEDA operator yourself. |
| **AI/ML ready** | GPU node pools, KAITO for model inference, AI Toolchain Operator for training pipelines. |

## Pricing Tiers: Pick the Right One

:::warning Do not run production on the Free tier
The Free tier has no SLA, no uptime guarantee, and limited API server resources. It exists for learning and dev/test only. Running production on Free tier is asking for an outage at the worst possible time.
:::

| Tier | Monthly Cost | SLA | Use Case | Recommendation |
|------|-------------|-----|----------|----------------|
| **Free** | $0 | None | Dev/test, learning, experimentation | Use for labs and sandboxes only |
| **Standard** | ~$73/month per cluster | 99.95% (with AZs) | Production workloads | **This is your default for production.** |
| **Premium** | ~$146/month per cluster | 99.95% | Mission-critical, long-term support | Use when you need LTS versions or advanced features |

The tier cost is ONLY for the control plane capabilities. You still pay for your node VMs separately.

## Critical: Node OS Migration Required

:::warning Azure Linux 2.0 deprecation -- November 2025
If your node pools run Azure Linux 2.0 (Mariner 2.0), you must migrate to Azure Linux 3.0 before November 2025. Azure Linux 2.0 reaches end of life and will stop receiving security patches. Do not delay this.
:::

Check your current node OS:

```bash
# See what OS your nodes are running
az aks nodepool list --resource-group myRG --cluster-name myCluster \
  --query "[].{Name:name, OsType:osType, OsSKU:osSku}" -o table
```

Migrate to Azure Linux 3:

```bash
# Update existing node pool OS SKU
az aks nodepool update --resource-group myRG --cluster-name myCluster \
  --name mynodepool --os-sku AzureLinux
```

## What AKS Gives You Out of the Box

Every AKS cluster, regardless of SKU, comes with:

- **CoreDNS** for in-cluster service discovery
- **Azure Disk and Azure Files CSI drivers** for persistent storage
- **kube-proxy** or **Cilium** for network routing (depending on your CNI choice)
- **Metrics Server** for HPA/VPA to function
- **Azure Identity** webhook for workload identity

What you opt into (and should):

- **Azure CNI Overlay with Cilium** -- best networking option for most clusters. Use it.
- **Workload Identity** -- stop using pod-managed identity. It is deprecated.
- **Azure Key Vault CSI driver** -- mount secrets from Key Vault directly into Pods.
- **App Routing (managed NGINX)** -- use it instead of installing your own ingress controller.

## Common Mistakes to Avoid

| Mistake | Why It Hurts | What to Do Instead |
|---------|-------------|-------------------|
| Running Free tier in production | No SLA, API server throttling under load | Pay the $73/month for Standard tier |
| Using kubenet networking | Limited to 400 nodes, no network policies, SNAT exhaustion | Use Azure CNI Overlay |
| Skipping Workload Identity | Pods using shared secrets to access Azure resources = security incident waiting to happen | Enable Workload Identity federation |
| Manual node upgrades | You will fall behind, accumulate CVEs | Enable node image auto-upgrade at minimum |
| Oversizing node pools from day one | Wasting money on idle compute | Start small, enable cluster autoscaler with sensible min/max |
| Ignoring resource requests/limits | Noisy neighbor problems, OOMKills, scheduling failures | Always set requests. Set limits for memory. |

## Your First Cluster in 60 Seconds

```bash
# Create a resource group
az group create --name aks-learning --location eastus2

# Create an AKS cluster (Standard tier, Azure CNI Overlay, 2 nodes)
az aks create \
  --resource-group aks-learning \
  --name my-first-cluster \
  --tier standard \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --node-count 2 \
  --node-vm-size Standard_D4s_v5 \
  --enable-managed-identity \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group aks-learning --name my-first-cluster

# Verify
kubectl get nodes
```

## Resources

- [Introduction to AKS](https://learn.microsoft.com/en-us/azure/aks/what-is-aks)
- [AKS Core Concepts](https://learn.microsoft.com/en-us/azure/aks/core-aks-concepts)
- [AKS Pricing Tiers](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers)
- [Azure Linux on AKS](https://learn.microsoft.com/en-us/azure/aks/use-azure-linux)
- [Workload Identity on AKS](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [AKS Networking Best Practices](https://learn.microsoft.com/en-us/azure/aks/concepts-network)

## Hands-on Lab

:::tip Get hands-on
**[Kubernetes the Easy Way with AKS Automatic](https://azure-samples.github.io/aks-labs/)**

Deploy your first application on AKS. The lab walks you through cluster creation, deployment, and scaling in about 45 minutes.
:::

---

**Next**: [AKS Automatic vs Standard](./aks-automatic-vs-standard) -- the most important architectural decision you will make.
