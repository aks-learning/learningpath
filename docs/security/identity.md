---
sidebar_position: 1
title: "Identity & Access"
description: "Integrate Azure Entra ID with AKS and manage Kubernetes RBAC using Azure RBAC and managed identities."
---

# Identity & Access

<span className="badge--intermediate">📚 Intermediate</span>

Learn how to integrate Azure Entra ID (formerly Azure AD) with AKS for centralized identity management. Implement Azure RBAC for Kubernetes resources and use managed identities for secure workload access.

## Key Concepts

- **Entra ID Integration**: Single sign-on for AKS cluster access
- **Azure RBAC for K8s**: Native Azure RBAC for Kubernetes resources
- **Managed Identities**: System-assigned and user-assigned identities
- **Token Refresh**: Automatic Azure Entra ID token management
- **Group-based Access**: Manage permissions using Entra ID groups
- **Pod Identities**: Authenticate pods to Azure services (legacy pattern)
- **Access Control**: Fine-grained permissions and role assignments

## Resources

- 📄 [Entra ID Integration with AKS](https://learn.microsoft.com/en-us/azure/aks/azure-ad-integration-cli)
- 📄 [Azure RBAC for Kubernetes Resources](https://learn.microsoft.com/en-us/azure/aks/manage-azure-rbac)

## Next Steps

- Configure Entra ID integration for your cluster
- Set up Azure RBAC roles for teams
- Implement managed identities for workloads
