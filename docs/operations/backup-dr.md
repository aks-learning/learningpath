---
sidebar_position: 2
title: "Backup and Disaster Recovery"
description: "Opinionated guide to AKS backup strategies, disaster recovery patterns, and when to use what."
---

# Backup and Disaster Recovery

Treat Kubernetes as cattle, not pets. Your Git repo IS your primary backup for manifests. AKS Backup exists for the things Git cannot capture: persistent volume data and runtime cluster state.

## The Fundamental Question

Before designing your DR strategy, answer this: is your workload stateless or stateful?

| Workload Type | Recovery Strategy | Backup Needed? |
|---------------|-------------------|----------------|
| Stateless apps (APIs, frontends) | Redeploy from Git + CI/CD | No. Just redeploy. |
| Stateful apps (databases, queues) | PV snapshots + restore | Yes. Non-negotiable. |
| Mixed (app + attached storage) | Git for manifests, AKS Backup for PVs | Yes, for the PV layer. |

:::tip Your Git repo is your primary backup

For stateless applications, your Git repository plus your CI/CD pipeline IS your disaster recovery plan. You do not need AKS Backup to recover a deployment manifest. You need it to recover the data on a PersistentVolume.
:::

## AKS Backup

AKS Backup is the Azure-native backup solution using Backup Vault and Trusted Access. It is managed, integrated, and does not require you to run any agents inside your cluster.

### What Gets Backed Up

- **Kubernetes resources**: Deployments, Services, ConfigMaps, Secrets, CRDs
- **Persistent Volumes**: CSI disk snapshots (Azure Disk, Azure Files)
- **Cluster-scoped resources**: Namespaces, ClusterRoles, StorageClasses

### Enable AKS Backup

```bash
# Install the backup extension
az k8s-extension create \
  --name azure-aks-backup \
  --cluster-name myCluster \
  --resource-group myRG \
  --cluster-type managedClusters \
  --extension-type Microsoft.DataProtection.Kubernetes

# Create a backup vault
az dataprotection backup-vault create \
  --vault-name myVault \
  --resource-group myRG \
  --location eastus2 \
  --storage-setting "[{type:GeoRedundant,datastore-type:VaultStore}]"

# Configure backup policy (daily, 30-day retention)
az dataprotection backup-policy create \
  --vault-name myVault \
  --resource-group myRG \
  --name daily-30d \
  --policy @backup-policy.json
```

:::warning Enable AKS Backup for all production clusters

The cost is negligible compared to losing your workload state. A single unrecoverable PV loss will cost you more in incident response than a year of backup storage.
:::

## Cross-Region Restore

Use a geo-redundant backup vault to enable cross-region restore. When your primary region goes down, you can restore workloads into a cluster in the paired region.

Requirements:
- Backup vault must be `GeoRedundant` (not `LocallyRedundant`)
- Target cluster must exist in the secondary region
- Network policies and ingress must be pre-configured in the DR cluster

## AKS Backup vs Velero

| Criteria | AKS Backup | Velero |
|----------|-----------|--------|
| Managed by | Microsoft | You |
| Storage backend | Azure Backup Vault | S3-compatible (you manage) |
| PV snapshots | Native CSI integration | Requires plugins |
| Cross-region | Built-in with geo-redundant vault | Manual replication setup |
| Support | Microsoft support ticket | Community / vendor |
| Cost model | Per-protected-instance | Storage + compute you manage |

:::info Use AKS Backup over Velero for new deployments

AKS Backup is integrated, managed, and does not require you to maintain an S3-compatible backend or worry about Velero version compatibility. If you already have Velero running and it works, keep it. For new clusters, choose AKS Backup.
:::

## Disaster Recovery Patterns

### Active-Passive (Recommended for most teams)

Two clusters in different regions. Primary handles all traffic. Secondary is warm (running, but no traffic). Failover via Azure Traffic Manager or Front Door DNS switch.

- **RTO**: 5-15 minutes (DNS propagation)
- **RPO**: Depends on backup frequency (hourly = up to 1 hour of data loss)
- **Cost**: ~1.5x a single cluster (secondary runs smaller node pools)

### Active-Active (Mission-critical only)

Two clusters both serving traffic via Azure Front Door or Traffic Manager. No failover needed because both are always active.

- **RTO**: Near-zero (traffic shifts automatically)
- **RPO**: Near-zero (both clusters have current state)
- **Cost**: 2x a single cluster
- **Complexity**: High. Requires stateless apps or distributed data layer.

### GitOps-Based Recovery

For fully stateless workloads: delete the broken cluster, create a new one, point Flux/ArgoCD at your Git repo, and let it reconcile. No backup needed.

```bash
# Disaster strikes. Recovery:
az aks create --resource-group dr-rg --name recovery-cluster ...
flux bootstrap github --owner=myorg --repository=k8s-manifests --path=clusters/prod
```

## Backup Scope Decisions

Not everything needs to be backed up. Be deliberate about what you protect.

| Resource | Back Up? | Rationale |
|----------|----------|-----------|
| Deployments, Services | No | Already in Git. Redeploy from source of truth. |
| ConfigMaps, Secrets | Maybe | Only if not managed by GitOps or external secret store |
| PersistentVolumes | Yes | Data not stored anywhere else |
| CRDs and CRs | Yes | Operator state may not be in Git |
| Namespaces | No | Recreated during deployment |
| RBAC (Roles, Bindings) | Maybe | Only if manually managed, not GitOps |

:::tip Backup what cannot be recreated

The rule is simple: if it exists only inside the cluster and nowhere else, back it up. If it can be reconstructed from Git, CI/CD, or an external system, do not waste backup storage on it.
:::

## Testing Your DR Plan

A backup you have never restored is not a backup. Schedule quarterly DR drills.

```bash
# Restore to a test cluster (not production!)
az dataprotection backup-instance restore trigger \
  --vault-name myVault \
  --resource-group myRG \
  --backup-instance-name myCluster-backup \
  --restore-request @restore-config.json
```

Validate after restore:
1. All expected namespaces exist
2. PVs are attached and contain expected data
3. Services are reachable and responding
4. CRDs and custom resources are intact

## Common Mistakes

1. **Backing up only manifests** -- Your manifests are already in Git. Back up what Git cannot store: PV data.
2. **Never testing restore** -- A backup you have never restored is not a backup. Test quarterly.
3. **LocallyRedundant vault for production** -- If the region fails, your backups fail too.
4. **No DR runbook** -- When the incident happens at 3 AM, you need step-by-step instructions, not a wiki page.
5. **Assuming PVs survive cluster deletion** -- They do not. If you delete the cluster, attached disks are deleted too unless you have snapshots.
6. **Backing up everything** -- Wastes storage and makes restore slower. Be selective.

## Resources

- [Azure Backup for AKS Overview](https://learn.microsoft.com/en-us/azure/backup/azure-kubernetes-service-backup-overview)
- [AKS Backup Configuration](https://learn.microsoft.com/en-us/azure/backup/azure-kubernetes-service-cluster-backup)
- [HA and DR for AKS](https://learn.microsoft.com/en-us/azure/aks/ha-dr-overview)
- [Cross-Region Restore](https://learn.microsoft.com/en-us/azure/backup/azure-kubernetes-service-cluster-backup-concept)
