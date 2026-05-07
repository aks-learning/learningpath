---
sidebar_position: 3
title: "AKS Automatic vs Standard"
description: "Start with AKS Automatic. Move to Standard only when you hit a wall. Here is exactly when and why."
---

# AKS Automatic vs Standard

This is the most important decision you will make when creating an AKS cluster. Get it right and you save weeks of configuration work. Get it wrong and you will be fighting the platform instead of shipping features.

**My strong recommendation: Start with AKS Automatic.** Migrate to Standard only when you hit a concrete limitation that blocks your workload. Not when you "might need flexibility someday." When you actually need it.

## The Core Difference

**AKS Automatic** is an opinionated, batteries-included Kubernetes experience. Microsoft makes the infrastructure decisions for you based on best practices. You deploy workloads. That is it.

**AKS Standard** is the full-control experience. You configure everything: node pools, networking, monitoring, scaling, security policies. More power, more responsibility, more things to get wrong.

:::tip The analogy that works
AKS Automatic is like a Tesla -- you get in and drive. AKS Standard is like building a car from a kit -- you can make it exactly what you want, but you better know what you are doing or you will end up with a vehicle that does not start.
:::

## Feature Comparison

| Capability | AKS Automatic | AKS Standard |
|-----------|---------------|--------------|
| **Node management** | Node Autoprovision -- K8s picks the right VM SKU based on your workload requirements | You create and manage node pools manually. You pick VM sizes. |
| **Networking** | Azure CNI Overlay + Cilium. Pre-configured. Done. | You choose: kubenet, Azure CNI, Azure CNI Overlay, Cilium, BYO CNI. |
| **Network policies** | Cilium-based, enabled by default | You enable and configure. Calico or Cilium or Azure NPM. |
| **Ingress** | App Routing (managed NGINX) included | Install and manage your own ingress controller. |
| **Monitoring** | Azure Monitor, Managed Prometheus, Container Insights -- all enabled | You enable each one. Or don't. Your choice. |
| **Scaling** | HPA + Node Autoprovision + KEDA built-in | You configure HPA, Cluster Autoscaler, optionally KEDA. |
| **Security defaults** | Workload Identity enabled, RBAC enforced, Pod Security Standards | You opt in to each security feature individually. |
| **Maintenance** | Automated, Microsoft-managed schedule | You configure maintenance windows and upgrade channels. |
| **OS image** | Azure Linux (latest), auto-upgraded | You choose Ubuntu or Azure Linux, manage upgrades. |
| **GPU support** | Yes, via node autoprovision | Yes, via dedicated GPU node pools. |
| **Windows nodes** | Not supported | Fully supported. |
| **Custom node pools** | Limited -- autoprovision handles it | Full control over pool count, VM SKU, taints, labels, zones. |
| **Private clusters** | Supported | Supported with more configuration options. |
| **Custom CNI/BYOCNI** | Not supported | Supported. |

## When to Choose AKS Automatic (Most Teams Should Start Here)

Choose Automatic when:

- You are deploying **standard workloads**: web apps, APIs, microservices, background workers
- Your team is **small (1-5 engineers)** and cannot dedicate someone to cluster operations
- You want **production-grade defaults** without reading 200 pages of documentation
- You value **shipping speed** over infrastructure customization
- You are **new to Kubernetes** and want guardrails that prevent common mistakes
- You run **Linux-only workloads**

:::info What you get without lifting a finger
With AKS Automatic, the moment your cluster is created you have: Cilium network policies, Managed Prometheus, KEDA for event-driven scaling, Node Autoprovision for right-sized nodes, Workload Identity for secure Azure access, App Routing for ingress, and automated OS patching. On Standard, configuring all of that takes a full day of work.
:::

## When to Choose AKS Standard (You Will Know When You Need It)

Choose Standard when:

- You need **Windows node pools** (Automatic does not support them)
- You require a **specific CNI plugin** or BYO networking that Automatic does not offer
- You have **compliance requirements** mandating specific node OS images, patch schedules, or configurations
- You run **specialized workloads** that need exact control over node affinity, taints, tolerations, and topology spread constraints across multiple custom node pools
- You need **multiple node pools with different VM SKUs** managed explicitly (not via autoprovision)
- You have **existing Terraform/Bicep IaC** that tightly manages cluster configuration and you cannot adapt it to Automatic's model
- You need **kubelet customization** or custom kernel parameters on nodes

## The Number One Mistake Teams Make

:::warning Don't over-engineer on day one
The number one mistake is choosing AKS Standard "because we might need the flexibility later" and then spending 3 weeks configuring networking, monitoring, scaling, and security that AKS Automatic would have given you in 5 minutes. By the time you finish, you have burned your sprint on infrastructure instead of shipping features.

Start with Automatic. If you hit a wall -- a real wall, not a hypothetical one -- migrate to Standard. The migration path exists and is supported.
:::

## Concrete Scenarios: Which One?

| Scenario | Recommendation | Why |
|----------|---------------|-----|
| Greenfield microservices app, team of 4 | **Automatic** | Ship features, not infrastructure config |
| Legacy .NET Framework app on Windows containers | **Standard** | Automatic does not support Windows nodes |
| Multi-tenant SaaS with strict network isolation per tenant | **Standard** | You need custom network policies and dedicated node pools per tenant |
| Dev/test environment for any workload | **Automatic** | Get a cluster running in minutes, not hours |
| ML training pipeline with GPU nodes | **Standard** | You need explicit GPU node pool management and spot instances |
| Standard web API with a PostgreSQL sidecar | **Automatic** | Node autoprovision handles the compute, you focus on the app |
| Regulated industry (healthcare, finance) with specific audit requirements | **Standard** | You need control over maintenance windows, patch versions, and network egress |
| Platform team serving 10+ dev teams | **Standard** | You need the full toolkit for multi-tenancy, custom policies, and governance |

## Migration Path

**Automatic to Standard**: Supported. You can update the cluster SKU from Automatic to Standard if you outgrow it. Your workloads continue running during the migration.

**Standard to Automatic**: Supported via SKU update. However, your existing custom configuration may conflict with Automatic's opinionated defaults. Test thoroughly before migrating.

```bash
# Check your current cluster SKU
az aks show --resource-group myRG --name myCluster --query "sku" -o json

# Migrate from Automatic to Standard (when you need more control)
az aks update --resource-group myRG --name myCluster --sku standard
```

## Pricing: SKU vs Tier (They Are Different Things)

This confuses everyone. Let me be clear:

- **SKU** (Automatic vs Standard) = determines your operational model (how much Microsoft manages for you)
- **Tier** (Free vs Standard vs Premium) = determines your SLA and control plane capabilities

They are independent. You can have:

| Combination | What It Means |
|-------------|---------------|
| AKS Automatic + Standard tier | Opinionated operations + production SLA. **This is the default for Automatic.** |
| AKS Standard + Free tier | Full control + no SLA. Good for dev/test only. |
| AKS Standard + Standard tier | Full control + production SLA. **Most common production setup.** |
| AKS Standard + Premium tier | Full control + LTS + advanced features. For mission-critical workloads. |

:::warning AKS Automatic always uses Standard tier at minimum
You cannot run AKS Automatic on the Free tier. It requires Standard or Premium tier because it is designed for production use. If you want a free cluster for experimentation, use AKS Standard with Free tier.
:::

## Creating Each Type

**AKS Automatic (recommended starting point):**

```bash
az aks create \
  --resource-group myRG \
  --name my-auto-cluster \
  --sku automatic \
  --location eastus2
# That is it. No node pool config, no CNI selection, no monitoring setup.
# Everything is configured to best practices automatically.
```

**AKS Standard (when you need full control):**

```bash
az aks create \
  --resource-group myRG \
  --name my-standard-cluster \
  --sku standard \
  --tier standard \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --node-count 3 \
  --node-vm-size Standard_D4s_v5 \
  --enable-managed-identity \
  --enable-workload-identity \
  --enable-oidc-issuer \
  --enable-azure-monitor-metrics \
  --enable-keda \
  --location eastus2
# Notice how many flags you need to match what Automatic gives you by default.
```

## Decision Flowchart

Ask yourself these questions in order:

1. **Do you need Windows containers?** Yes = Standard. No = continue.
2. **Do you need a custom CNI or BYO networking?** Yes = Standard. No = continue.
3. **Do you have an existing IaC pipeline that manages node pools explicitly?** Yes = Standard (unless you are willing to refactor). No = continue.
4. **Do you have compliance mandates requiring specific node OS versions or patch schedules?** Yes = Standard. No = continue.
5. **None of the above?** = **Use AKS Automatic.**

## Resources

- [AKS Automatic Overview](https://learn.microsoft.com/en-us/azure/aks/intro-aks-automatic)
- [AKS Standard Overview](https://learn.microsoft.com/en-us/azure/aks/what-is-aks)
- [Compare AKS Pricing Tiers](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers)
- [Node Autoprovision in AKS](https://learn.microsoft.com/en-us/azure/aks/node-autoprovision)
- [Migrate Between AKS SKUs](https://learn.microsoft.com/en-us/azure/aks/intro-aks-automatic#migrate-existing-aks-standard-clusters)

## Hands-on Lab

:::tip Try it yourself
**[Kubernetes the Easy Way with AKS Automatic](https://azure-samples.github.io/aks-labs/)**

Create an AKS Automatic cluster, deploy a workload, and see how Node Autoprovision, monitoring, and ingress work without any manual configuration. About 45 minutes.
:::

---

**Next**: [Cluster Setup -- Tooling](../cluster-setup/tooling) -- set up your local development environment for working with AKS.
