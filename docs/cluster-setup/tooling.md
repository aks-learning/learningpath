---
sidebar_position: 1
title: Tooling
description: Tools for deploying and managing AKS clusters
---

# Tooling

<span className="badge--beginner">🟢 Beginner</span>

Essential tools for creating and managing AKS clusters.

## CLI Tools

| Tool | Purpose |
|------|---------|
| **Azure CLI (`az aks`)** | Create, manage, and troubleshoot AKS clusters |
| **kubectl** | Interact with the Kubernetes API |
| **kubelogin** | Entra ID authentication for kubectl |
| **Helm** | Package manager for Kubernetes |
| **Kustomize** | Template-free configuration management |

## Infrastructure as Code

| Tool | Best For |
|------|----------|
| **Bicep** | Azure-native, simple syntax, first-party support |
| **Terraform** | Multi-cloud, large ecosystem, state management |
| **ARM Templates** | Legacy, JSON-based (prefer Bicep) |
| **Pulumi** | Programming language-based IaC |

## Resources

- 📄 [Azure CLI for AKS](https://learn.microsoft.com/en-us/cli/azure/aks)
- 📄 [Deploy AKS with Bicep](https://learn.microsoft.com/en-us/azure/aks/learn/quick-kubernetes-deploy-bicep)
- 📄 [Deploy AKS with Terraform](https://learn.microsoft.com/en-us/azure/aks/learn/quick-kubernetes-deploy-terraform)
- 📄 [Deploy AKS with ARM Templates](https://learn.microsoft.com/en-us/azure/aks/learn/quick-kubernetes-deploy-rm-template)

---

**Next**: [Cluster Design Decisions](./cluster-design) →
