---
sidebar_position: 2
title: "Workload Identity"
description: "Use Azure Workload Identity for secure pod authentication replacing pod-managed identity with OIDC federation."
---

# Workload Identity

<span className="badge--intermediate">📚 Intermediate</span> [<span className="badge--new">🆕 New</span>]

Understand Azure Workload Identity, a modern approach using workload identity federation and OIDC (OpenID Connect) for secure pod authentication to Azure resources. This replaces the legacy pod-managed identity pattern.

## Key Concepts

- **Workload Identity Federation**: OIDC-based authentication without shared secrets
- **Service Account Binding**: Link Kubernetes service accounts to Azure identities
- **OIDC Provider**: AKS-managed OIDC token provider
- **Secrets Elimination**: No managed identity credentials in Kubernetes
- **Access Tokens**: Automatic token acquisition for Azure services
- **Migration Path**: Upgrade from pod-managed identity
- **Multi-cloud Ready**: Standard OIDC federation pattern

## Resources

- 📄 [Azure Workload Identity Overview](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)

## Next Steps

- Enable Workload Identity on your AKS cluster
- Configure service account and Entra ID app
- Migrate existing pod identities
