---
sidebar_position: 1
title: "Storage in AKS"
description: "Storage classes, persistent volumes, and dynamic provisioning -- what to use and when"
---

# Storage in AKS

Use Azure Disks for databases. Azure Files for shared storage. Blob for large datasets. Everything else is a special case.

## Storage classes (built-in)

AKS ships with these storage classes pre-configured. Don't create your own unless you need custom parameters.

| Storage Class | Backend | Access Mode | Use Case |
|---------------|---------|-------------|----------|
| `managed-csi` | Azure Disks (Premium LRS) | ReadWriteOnce | Databases, single-pod stateful apps |
| `managed-csi-premium` | Azure Disks (Premium LRS) | ReadWriteOnce | Same as above, explicit premium |
| `azurefile-csi` | Azure Files (Standard) | ReadWriteMany | Shared config, CMS content |
| `azurefile-csi-premium` | Azure Files (Premium) | ReadWriteMany | Shared storage needing IOPS |
| `azureblob-nfs` | Blob NFS | ReadWriteMany | Large datasets, ML training data |

:::tip Opinion

Use `managed-csi` (Azure Disks) as your default for anything stateful. Only reach for Azure Files when multiple pods need simultaneous read/write access to the same data.
:::

## PersistentVolume lifecycle

![PersistentVolume Lifecycle](/img/pv-lifecycle.svg)

Always use dynamic provisioning unless you have pre-existing disks to import. Dynamic provisioning creates the Azure resource automatically when a PVC is submitted.

## Dynamic provisioning example

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
      storage: 100Gi
```

That's it. AKS creates a Premium SSD managed disk, attaches it to the node running your pod, and mounts it. No manual disk creation needed.

## Reclaim policies

| Policy | Behavior on PVC Delete | Use When |
|--------|----------------------|----------|
| `Delete` | Disk/share is destroyed | Ephemeral workloads, dev/test, caches |
| `Retain` | Disk/share is preserved (orphaned) | Production databases, data you cannot lose |

:::warning

The default reclaim policy for `managed-csi` is `Delete`. If you delete the PVC, your disk and all data is gone. For production databases, create a custom StorageClass with `reclaimPolicy: Retain`.
:::

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: managed-csi-retain
provisioner: disk.csi.azure.com
parameters:
  skuName: Premium_LRS
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

## Access modes

| Mode | Meaning | Supported By |
|------|---------|-------------|
| ReadWriteOnce (RWO) | Single node read/write | Azure Disks |
| ReadOnlyMany (ROX) | Multi-node read-only | Azure Disks, Azure Files |
| ReadWriteMany (RWX) | Multi-node read/write | Azure Files, Blob NFS |

:::info

Azure Disks are block devices -- they physically attach to one node at a time. If you need multiple pods on different nodes writing to the same volume, you need Azure Files or Blob NFS.
:::

## Common mistakes

1. **Using Azure Files for databases** -- Azure Files has higher latency than Disks. Use Disks for anything IOPS-sensitive.
2. **Forgetting `volumeBindingMode: WaitForFirstConsumer`** -- Without this, the disk may provision in a zone where no node can mount it.
3. **Not setting `allowVolumeExpansion: true`** -- You will need to resize disks. Enable this upfront.
4. **Using `Delete` reclaim policy for production data** -- One accidental `kubectl delete pvc` destroys your database.

## Resources

- [Storage concepts in AKS](https://learn.microsoft.com/azure/aks/concepts-storage)
- [CSI drivers in AKS](https://learn.microsoft.com/azure/aks/csi-storage-drivers)
- [Dynamic volume provisioning](https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/)
