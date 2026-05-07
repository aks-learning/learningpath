---
sidebar_position: 5
title: "Secrets Management"
description: "Store and manage application secrets securely using Azure Key Vault integration through CSI Secrets Store driver."
---

# Secrets Management

<span className="badge--intermediate">📚 Intermediate</span>

Master secure secrets management in AKS using the CSI Secrets Store driver to integrate with Azure Key Vault. Store sensitive credentials, API keys, and certificates securely.

## Key Concepts

- **CSI Secrets Store Driver**: Kubernetes CSI plugin for secrets integration
- **Azure Key Vault**: Centralized secrets management service
- **Secret Mounting**: Mount secrets as volumes in pods
- **Automatic Rotation**: Update secrets without pod restart
- **Access Control**: Managed identity-based Key Vault access
- **Encryption**: Secrets encrypted in transit and at rest
- **Audit Logging**: Track secret access and changes

## Resources

- 📄 [CSI Secrets Store Driver in AKS](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-driver)

## Next Steps

- Install CSI Secrets Store driver
- Configure Key Vault provider
- Create SecretProvider classes for applications
