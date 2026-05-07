---
sidebar_position: 2
title: "Azure Disks and Files"
description: "Block storage vs shared file systems -- choosing the right storage backend for your AKS workloads"
---

# Azure Disks and Files

Azure Disks for databases and single-pod stateful workloads. Azure Files for shared storage across pods. Pick wrong and you get either poor performance or unnecessary complexity.

## Azure Disks

Block storage that attaches to a single node. Think of it as a virtual hard drive plugged into one VM.

**Best for:** Databases (PostgreSQL, MySQL, MongoDB), message queues, anything IOPS-sensitive with single-writer access.

| Tier | IOPS | Throughput | Use Case |
|------|------|------------|----------|
| Premium SSD v2 | Up to 80,000 | Up to 1,200 MB/s | Production databases (best price/performance) |
| Premium SSD | Up to 20,000 | Up to 900 MB/s | Production workloads with predictable patterns |
| Standard SSD | Up to 6,000 | Up to 750 MB/s | Dev/test environments only |
| Ultra Disk | Up to 160,000 | Up to 4,000 MB/s | Extreme IOPS (SAP HANA, large SQL instances) |
| Standard HDD | Up to 2,000 | Up to 500 MB/s | Never use in AKS |

:::tip Opinion

Premium SSD v2 for production databases -- it offers configurable IOPS/throughput independent of disk size, so you don't overpay for capacity you don't need just to get more IOPS. Standard SSD for dev/test. Never HDD for anything in AKS.
:::

### PVC example: Azure Disk

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: managed-csi
  resources:
    requests:
      storage: 256Gi
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  template:
    spec:
      containers:
        - name: postgres
          volumeMounts:
            - mountPath: /var/lib/postgresql/data
              name: data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: postgres-data
```

## Azure Files

Network file shares (SMB or NFS) accessible from multiple pods simultaneously.

**Best for:** Shared configuration, CMS content directories, legacy apps that need a file system shared across instances.

| Protocol | OS Support | Performance | Use Case |
|----------|-----------|-------------|----------|
| NFS 4.1 | Linux only | Better for small files, lower latency | Linux workloads needing shared storage |
| SMB 3.0 | Linux + Windows | Good for large sequential I/O | Windows containers, cross-platform |

:::warning Common Mistake

Don't use Azure Files for databases. The network latency of a file share compared to a locally-attached disk will destroy your database performance. Use Azure Disks for anything that does frequent random I/O.
:::

### PVC example: Azure Files (NFS)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-content
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: azurefile-csi-premium
  resources:
    requests:
      storage: 100Gi
```

## Decision matrix

| Requirement | Use | Why |
|-------------|-----|-----|
| Database storage | Azure Disks (Premium SSD v2) | Lowest latency, highest IOPS |
| Shared content across pods | Azure Files (NFS) | ReadWriteMany access |
| Windows container storage | Azure Files (SMB) | Only RWX option for Windows |
| ML training data (large files) | Azure Blob NFS | Cheapest for large datasets |
| Temp/cache data | emptyDir or ephemeral disks | No persistence needed |

## Performance tuning

```yaml
# Custom StorageClass for Premium SSD v2 with specific IOPS
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: premiumv2-custom
provisioner: disk.csi.azure.com
parameters:
  skuName: PremiumV2_LRS
  DiskIOPSReadWrite: "5000"
  DiskMBpsReadWrite: "200"
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

:::info

Premium SSD v2 lets you set IOPS and throughput independently of disk size. A 100Gi disk can have 5000 IOPS instead of being locked to the size-based tier. This is why it's the best choice for production.
:::

## Resources

- [Azure Disks CSI driver](https://learn.microsoft.com/azure/aks/azure-csi-disk-storage-provision)
- [Azure Files CSI driver](https://learn.microsoft.com/azure/aks/azure-csi-files-storage-provision)
- [Premium SSD v2 overview](https://learn.microsoft.com/azure/virtual-machines/disks-types#premium-ssd-v2)
