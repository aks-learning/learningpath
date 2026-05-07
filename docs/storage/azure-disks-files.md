---
sidebar_position: 2
title: "Azure Disks & Files"
description: "Use managed disks for block storage and Azure Files for shared file systems in AKS."
---

# Azure Disks & Files

<span className="badge--intermediate">📚 Intermediate</span>

Master block and file storage options in AKS. Learn when to use Azure Managed Disks for block storage and Azure Files for shared file systems.

## Key Concepts

- **Azure Managed Disks**: Block storage for single-pod access
- **Azure Files**: SMB-based file shares for multi-pod access
- **CSI Drivers**: AKS-managed disk and file drivers
- **Performance Tiers**: Premium and standard options
- **Provisioning**: Static and dynamic provisioning
- **Snapshots**: Point-in-time backup capabilities
- **Encryption**: Data encryption at rest and in transit
- **Cost Comparison**: Disk vs. Files pricing models

## Resources

- 📄 [Azure Disks Storage Provisioning](https://learn.microsoft.com/en-us/azure/aks/azure-csi-disk-storage-provision)
- 📄 [Azure Files Storage Provisioning](https://learn.microsoft.com/en-us/azure/aks/azure-csi-files-storage-provision)

## Next Steps

- Choose appropriate storage types for workloads
- Configure StorageClasses for disks and files
- Implement storage scaling strategies
