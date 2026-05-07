---
sidebar_position: 2
title: What is AKS?
description: Introduction to Azure Kubernetes Service and its key capabilities
---

# What is AKS?

<span className="badge--beginner">🟢 Beginner</span>

Azure Kubernetes Service (AKS) is a managed Kubernetes service that simplifies deploying, managing, and scaling containerized applications using Kubernetes on Azure.

## Why AKS vs. Self-Managed Kubernetes?

| Feature | Self-Managed K8s | AKS |
|---------|-----------------|-----|
| Control Plane | You manage | Microsoft manages (free) |
| Upgrades | Manual | Automated channels available |
| Scaling | Manual setup | Built-in autoscaler + KEDA |
| Networking | Configure from scratch | Azure CNI, overlay, cilium |
| Identity | Set up your own | Entra ID + Workload Identity |
| Monitoring | Install & maintain | Azure Monitor integrated |
| Security | Patch yourself | Defender for Containers |

## AKS Architecture

```
┌─────────────────────────────────────────────┐
│              Azure (Microsoft-managed)        │
│  ┌─────────────────────────────────────┐    │
│  │         Control Plane                │    │
│  │  API Server │ etcd │ Scheduler      │    │
│  │  Controller Manager                  │    │
│  └─────────────────────────────────────┘    │
├─────────────────────────────────────────────┤
│              Your Subscription               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Node Pool│  │ Node Pool│  │ Node Pool│  │
│  │ (System) │  │ (User)   │  │ (GPU)    │  │
│  │  Pods    │  │  Pods    │  │  Pods    │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────┘
```

## Key Capabilities

- 🆓 **Free control plane** — You only pay for worker nodes
- 🔄 **Automated upgrades** — Multiple channels (Stable, Rapid, Node image)
- 🌐 **Integrated networking** — Azure VNet native, private clusters
- 🔒 **Enterprise security** — Entra ID, RBAC, Defender, Confidential Containers
- 📊 **Full observability** — Azure Monitor, Prometheus, Grafana managed
- ⚡ **Multi-level scaling** — Pod (HPA/VPA), Node (Cluster Autoscaler), Event (KEDA)
- 🤖 **AI-ready** — GPU pools, KAITO, AI Toolchain Operator

## Resources

- 📄 [Introduction to AKS](https://learn.microsoft.com/en-us/azure/aks/what-is-aks)
- 📄 [AKS Core Concepts](https://learn.microsoft.com/en-us/azure/aks/core-aks-concepts)
- 📄 [Nodes and Node Pools](https://learn.microsoft.com/en-us/azure/aks/core-aks-concepts#nodes)

## 🧪 Hands-on Lab

> **[Kubernetes the Easy Way with AKS Automatic](https://azure-samples.github.io/aks-labs/docs/getting-started/aks-automatic)**
> Deploy your first application on AKS using the simplest path possible.
> ⏱️ ~45 minutes | 🟢 Beginner

---

**Next**: [AKS Automatic vs Standard](./aks-automatic-vs-standard) →
