---
sidebar_position: 1
title: "Storage Concepts"
description: "Understand Kubernetes storage basics including CSI drivers, StorageClasses, persistent volumes, and persistent volume claims."
---

# Storage Concepts

<span className="badge--intermediate">📚 Intermediate</span>

Learn fundamental Kubernetes storage concepts and how they apply to AKS. Understand CSI drivers, StorageClasses, PersistentVolumes, and PersistentVolumeClaims.

## Key Concepts

- **CSI Drivers**: Container Storage Interface for plugin architecture
- **StorageClasses**: Define storage provisioning parameters
- **PersistentVolume (PV)**: Storage resource abstraction
- **PersistentVolumeClaim (PVC)**: Storage request by applications
- **Dynamic Provisioning**: Automatic storage creation
- **Volume Reclaim Policies**: Clean-up on PVC deletion
- **Access Modes**: ReadWriteOnce, ReadOnlyMany, ReadWriteMany
- **Supported Backends**: Azure Disks, Azure Files, other providers

## Resources

- 📄 [Storage Concepts in AKS](https://learn.microsoft.com/en-us/azure/aks/concepts-storage)
- 🧪 [Advanced Storage Concepts Lab](https://azure-samples.github.io/aks-labs/docs/storage/advanced-storage-concepts)

## 🧪 Hands-on Lab

> **[Advanced Storage Concepts](https://azure-samples.github.io/aks-labs/docs/storage/advanced-storage-concepts)**
> Deep dive into Kubernetes storage architecture and advanced provisioning patterns.
> ⏱️ ~60 minutes | 📚 Intermediate

## Next Steps

- Understand StorageClass design
- Plan PV/PVC requirements
- Design data persistence strategy
