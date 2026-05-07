---
sidebar_position: 4
title: "AKS Support Policy"
description: "What Microsoft supports, what they don't, version lifecycle, and how to get help"
---

# AKS Support Policy

Stay within N-1 Kubernetes version. Don't wait until your version is out of support. That's a fire drill you don't need.

## What Microsoft Supports

| Supported | Examples |
|-----------|----------|
| AKS control plane | API server, etcd, scheduler, controller-manager |
| AKS-managed components | CoreDNS, kube-proxy, Azure CNI, CSI drivers |
| Azure integrations | Load balancers, disks, managed identity, Defender |
| Node OS (managed) | OS patches, security updates, kernel issues |
| Networking (AKS-configured) | CNI, load balancer, ingress controller (AGIC) |
| AKS add-ons | KEDA, KAITO, Azure Policy, Monitoring |

## What Microsoft Does NOT Support

| Not Supported | Your Responsibility |
|---------------|-------------------|
| Your application code | Debugging your microservices |
| Third-party Helm charts | NGINX, cert-manager, Prometheus issues |
| Custom operators | Operators you installed yourself |
| Workload configuration | Pod spec, resource requests, health probes |
| Self-installed components | Service meshes, custom CNI plugins |
| Data recovery | Your database backups and PVC data |

:::warning
"My pods keep crashing" is not an AKS support issue unless the crash is caused by a platform bug. Pod crashes due to OOMKill, bad health probes, or application errors are your responsibility. Microsoft support will tell you this politely.
:::

## Kubernetes Version Support

AKS supports the current GA minor version and the previous two minor versions (N-2).

```
Example (as of early 2025):
  1.31.x  ← Current (GA)
  1.30.x  ← Supported (N-1)
  1.29.x  ← Supported (N-2)
  1.28.x  ← Out of support
```

:::tip Opinion
Stay on N-1. You get the stability of a proven version while keeping a comfortable buffer before end-of-support. Teams on N-2 are always one missed upgrade away from an emergency.
:::

| Version Strategy | Risk | Best For |
|-----------------|------|----------|
| Always on latest (N) | New bugs, breaking changes | Teams with strong CI/CD testing |
| N-1 (recommended) | Low risk, well-tested | Most production workloads |
| N-2 | Must upgrade soon, pressure | Regulated environments with slow approval |
| Past N-2 | Out of support, no patches | Never acceptable |

## Long-Term Support (LTS)

AKS Premium tier includes Long-Term Support: 2 years per minor version instead of 1 year.

| Tier | Version Support Window | Use Case |
|------|----------------------|----------|
| Standard | ~12 months per minor version | Most teams (upgrade yearly) |
| Premium (LTS) | ~24 months per minor version | Regulated industries, slow change control |

```bash
# Check your cluster's current version and available upgrades
az aks show --resource-group myrg --name myaks --query "kubernetesVersion"
az aks get-upgrades --resource-group myrg --name myaks --output table
```

## Node OS Support

| OS | Status | Recommendation |
|----|--------|---------------|
| Azure Linux (AzureLinux 3) | Recommended | Smallest attack surface, fastest boot, Microsoft-maintained |
| Ubuntu 22.04 | Supported | Good for teams needing Ubuntu ecosystem compatibility |
| Azure Linux 2.0 (Mariner) | Deprecated (Nov 2025) | Migrate to AzureLinux 3 now |
| Windows Server 2022 | Supported | Required for Windows containers |

:::warning
Azure Linux 2.0 (formerly CBL-Mariner) reaches end of life November 2025. If your node pools use it, plan migration to AzureLinux 3. This is not optional -- you will stop receiving security patches.
:::

```bash
# Check your node pool OS SKU
az aks nodepool show \
  --resource-group myrg \
  --cluster-name myaks \
  --name system \
  --query "osSku"
```

## Opening a Support Ticket

| Severity | Response Time | When to Use |
|----------|--------------|-------------|
| A (Critical) | 1 hour | Production down, complete outage |
| B (High) | 4 hours | Significant degradation, partial outage |
| C (Standard) | 8 business hours | Questions, non-urgent issues |

**What to include in a ticket:**
1. Cluster resource ID (`az aks show --query id`)
2. Time window of the issue (UTC)
3. Error messages (exact text, not screenshots)
4. What changed before the issue started
5. Steps already taken to troubleshoot

:::info
Before opening a ticket, check [AKS GitHub Issues](https://github.com/Azure/AKS/issues) -- known issues and release notes are posted there. Many "bugs" are already documented with workarounds.
:::

## Upgrade Planning

```bash
# Preview what will change in an upgrade
az aks nodepool get-upgrades \
  --resource-group myrg \
  --cluster-name myaks \
  --nodepool-name system

# Perform a control plane upgrade first, then node pools
az aks upgrade \
  --resource-group myrg \
  --name myaks \
  --kubernetes-version 1.30.4

# Then upgrade node pools
az aks nodepool upgrade \
  --resource-group myrg \
  --cluster-name myaks \
  --name system \
  --kubernetes-version 1.30.4
```

## Resources

- [AKS support policies](https://learn.microsoft.com/azure/aks/support-policies)
- [Supported Kubernetes versions](https://learn.microsoft.com/azure/aks/supported-kubernetes-versions)
- [AKS release notes and known issues](https://github.com/Azure/AKS/releases)
- [Long-term support](https://learn.microsoft.com/azure/aks/long-term-support)
