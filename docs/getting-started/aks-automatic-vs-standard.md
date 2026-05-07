---
sidebar_position: 3
title: AKS Automatic vs Standard
description: Choosing between AKS Automatic and AKS Standard SKUs
---

# AKS Automatic vs Standard

<span className="badge--beginner">🟢 Beginner</span> <span className="badge--new">🆕 New</span>

AKS offers two main SKUs. Understanding when to use each is a critical first decision.

## Quick Comparison

| Feature | AKS Automatic | AKS Standard |
|---------|:---:|:---:|
| **Control Plane Management** | ✅ Full | ✅ Full |
| **Node Management** | ✅ Automated | ❌ You configure |
| **Networking** | Pre-configured (CNI Overlay + Cilium) | Choose your own |
| **Scaling** | Auto (Node Autoprovision + HPA) | Configure autoscaler |
| **Security** | Defaults enforced (Workload ID, RBAC) | Opt-in |
| **Monitoring** | Enabled by default | Opt-in |
| **Maintenance** | Automated | Configure window |
| **Customization** | Limited (opinionated) | Full flexibility |
| **Best for** | New workloads, dev/test, simpler apps | Enterprise, complex requirements |
| **Pricing** | Standard tier included | Free/Standard/Premium tier options |

## When to Choose AKS Automatic

✅ You're **new to Kubernetes** and want guardrails
✅ You want **minimal operational overhead**
✅ Your workloads are **standard web apps, APIs, microservices**
✅ You prefer **convention over configuration**
✅ You want **best practices enforced by default**

## When to Choose AKS Standard

✅ You need **custom networking** (specific CNI, private clusters, custom DNS)
✅ You have **compliance requirements** needing specific configurations
✅ You run **specialized workloads** (GPU, Windows, ARM64 nodes)
✅ You need **fine-grained control** over node pools, taints, labels
✅ You have **existing Terraform/Bicep** IaC that manages cluster config

## Migration Path

You can start with AKS Automatic and migrate to Standard later if you outgrow it. The reverse is not currently supported.

## Resources

- 📄 [AKS Automatic Overview](https://learn.microsoft.com/en-us/azure/aks/intro-aks-automatic)
- 📄 [AKS Standard Overview](https://learn.microsoft.com/en-us/azure/aks/what-is-aks)
- 📄 [Compare AKS Tiers](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers)

## 🧪 Hands-on Lab

> **[Kubernetes the Easy Way with AKS Automatic](https://azure-samples.github.io/aks-labs/docs/getting-started/aks-automatic)**
> Experience the simplicity of AKS Automatic firsthand.
> ⏱️ ~45 minutes | 🟢 Beginner

---

**Next**: [Cluster Setup — Tooling](../cluster-setup/tooling) →
