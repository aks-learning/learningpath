---
sidebar_position: 3
title: "Azure Container Storage"
description: "Kubernetes-native pooled storage with replication, ephemeral NVMe, and thin provisioning"
---

# Azure Container Storage

Use Azure Container Storage for stateful workloads that need pooled storage, volume replication, or ephemeral high-performance local volumes. For simple single-disk PVCs, stick with the regular CSI drivers.

## What It Is

Azure Container Storage is a Kubernetes-native storage management layer. Instead of one PVC mapping to one Azure Disk, it creates storage pools that can be carved into volumes with advanced features: replication across nodes, thin provisioning, snapshots, and ephemeral local NVMe volumes.

:::info
Think of it as a software-defined storage layer on top of Azure's infrastructure. It sits between your PVCs and the underlying storage backend (Azure Disks, Ephemeral NVMe, or Elastic SAN).
:::

## Storage Backends

| Backend | Persistence | Performance | Use Case |
|---------|-------------|-------------|----------|
| Azure Disks | Persistent, survives node failure | Good (network-attached) | Stateful apps needing replication |
| Ephemeral (Local NVMe) | Lost on node restart | Extremely fast (local I/O) | Caches, temp data, scratch space |
| Azure Elastic SAN | Persistent, shared | High IOPS at scale | Large-scale stateful deployments |

:::tip Opinion
Use Azure Container Storage for two scenarios: (1) ephemeral local NVMe volumes for caches and temp data that need raw speed, or (2) pooled persistent storage where you need replication across availability zones. For everything else, the standard CSI drivers are simpler.
:::

## Ephemeral Disks (Local NVMe)

Local NVMe disks on the node. Incredibly fast. No network hop. No persistence guarantees.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: acstor-ephemeraldisk-nvme
provisioner: containerstorage.csi.azure.com
parameters:
  storagePool: ephemeraldisk-nvme
volumeBindingMode: WaitForFirstConsumer
reclaimPolicy: Delete
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-cache
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: acstor-ephemeraldisk-nvme
  resources:
    requests:
      storage: 50Gi
```

**Perfect for:** Redis caches, Elasticsearch temp storage, ML model caches, build artifact scratch space.

:::warning
Ephemeral NVMe data is gone when the node restarts, gets reimaged, or your pod moves to another node. Only use for data you can reconstruct. Never for databases.
:::

## Persistent Pools (Azure Disks Backend)

```yaml
apiVersion: containerstorage.azure.com/v1
kind: StoragePool
metadata:
  name: azuredisk-pool
  namespace: acstor
spec:
  poolType:
    azureDisk:
      skuName: Premium_LRS
  resources:
    requests:
      storage: 1Ti
```

Volumes carved from this pool get replication and thin provisioning automatically. The pool pre-provisions capacity so new PVCs bind instantly instead of waiting for disk creation.

## When to Use Container Storage vs CSI Drivers

| Requirement | Use Container Storage | Use CSI Drivers |
|-------------|----------------------|-----------------|
| Simple single-disk PVC | No | Yes -- simpler, fewer moving parts |
| Local NVMe ephemeral volumes | Yes | N/A -- CSI drivers don't support this |
| Volume replication across nodes | Yes | No -- not supported |
| Thin provisioning (overcommit) | Yes | No |
| Pooled storage management | Yes | No |
| Production database (single writer) | Either works | Simpler with CSI |
| Fastest possible local I/O | Yes (NVMe) | No |

## Enabling Azure Container Storage

```bash
# Enable on existing cluster
az aks update \
  --resource-group myrg \
  --name myaks \
  --enable-azure-container-storage ephemeralDisk

# Or with Azure Disks backend
az aks update \
  --resource-group myrg \
  --name myaks \
  --enable-azure-container-storage azureDisk
```

:::info
Azure Container Storage requires specific VM SKUs that have local NVMe disks (for ephemeral) or sufficient capacity. L-series and Lsv2-series VMs have local NVMe. Standard D/E-series work with the Azure Disks backend.
:::

## Common Mistakes

1. **Using ephemeral NVMe for persistent data** -- Your data will be lost. This is by design.
2. **Enabling Container Storage when you just need a simple PVC** -- Adds operational complexity for no benefit.
3. **Not checking VM SKU compatibility** -- Ephemeral NVMe requires VMs with local NVMe drives.

## Resources

- [Azure Container Storage overview](https://learn.microsoft.com/azure/storage/container-storage/container-storage-introduction)
- [Enable Azure Container Storage](https://learn.microsoft.com/azure/aks/container-storage-enable)
- [Ephemeral disk storage pools](https://learn.microsoft.com/azure/storage/container-storage/use-container-storage-with-local-disk)
