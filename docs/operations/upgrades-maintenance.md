---
sidebar_position: 1
title: "Upgrades and Maintenance"
description: "Opinionated guide to AKS cluster upgrades, auto-upgrade channels, maintenance windows, and surge settings."
---

# Upgrades and maintenance

Kubernetes moves fast. AKS drops support for minor versions roughly every 3 months. If you are not upgrading continuously, you are accumulating technical debt that will hit you all at once.

## Auto-upgrade channels

AKS offers five auto-upgrade channels. Pick one and stick with it.

| Channel | Behavior | Use When |
|---------|----------|----------|
| `none` | No automatic upgrades | Never. Seriously. |
| `patch` | Auto-applies patch versions (e.g., 1.28.3 to 1.28.5) | Legacy clusters you cannot touch often |
| `stable` | Moves to N-1 minor version after GA+30 days | Production clusters |
| `rapid` | Moves to latest GA minor version immediately | Non-prod, staging, canary |
| `node-image` | Only upgrades node OS images, not K8s version | Legacy -- planned for deprecation. Use node OS auto-upgrade channels instead. |

:::tip Use Stable for production

Use `stable` channel for production. Use `rapid` for non-prod to catch issues early. Never use `none` -- you will fall behind and face a painful multi-version jump that requires rebuilding your cluster. AKS Automatic defaults to `stable` cluster channel + `NodeImage` node OS channel.
:::

```bash
# Set auto-upgrade channel to stable
az aks update \
  --resource-group myRG \
  --name myCluster \
  --auto-upgrade-channel stable
```

## Maintenance windows

Schedule upgrades during low-traffic hours. Do not let Azure pick a random Tuesday afternoon.

```bash
# Create a maintenance window: Sundays 2-6 AM UTC
az aks maintenanceconfiguration add \
  --resource-group myRG \
  --cluster-name myCluster \
  --name default \
  --weekday Sunday \
  --start-hour-utc 2 \
  --duration 4
```

Maintenance windows apply to both control plane and node pool upgrades. Set a separate `aksManagedNodeOSUpgradeSchedule` for node image updates if you want different timing.

## Node OS auto-upgrade channels

Node OS auto-upgrade is separate from the cluster auto-upgrade channel. It controls how node OS images are patched.

| Channel | Behavior |
|---------|----------|
| `None` | No automatic OS updates |
| `Unmanaged` | OS patches applied via apt/yum, no reboot |
| `SecurityPatch` | Security patches only, minimal disruption |
| `NodeImage` | Full node image replacement weekly (Linux) or monthly (Windows). **Recommended.** |

The default for new clusters (API 2023-06-01+) is `NodeImage`.

## Node image upgrades

Node image upgrades are separate from Kubernetes version upgrades. They patch the OS, containerd, and kubelet without changing your K8s version.

:::warning Enable auto node image upgrade

Enable `NodeImage` auto-upgrade at minimum. OS patches fix CVEs. Skipping them is a security incident waiting to happen.
:::

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --node-os-upgrade-channel NodeImage
```

## Surge upgrades

The `max-surge` setting controls how many extra nodes AKS spins up during an upgrade. More surge = faster upgrades but higher transient cost.

| Environment | max-surge | Rationale |
|-------------|-----------|-----------|
| Production | 33% | Slower but safer. Maintains capacity headroom. |
| Dev/Test | 1 | Save money. Downtime is acceptable. |
| Critical workloads | 50% | Fast rollout when you cannot tolerate extended upgrade windows |

```bash
az aks nodepool update \
  --resource-group myRG \
  --cluster-name myCluster \
  --name nodepool1 \
  --max-surge 33%
```

:::tip Set max-surge to 33% for production

Slower but safer. With 33%, one-third of your nodes upgrade in parallel while the rest keep serving traffic. Use 1 node for dev/test where cost matters more than speed.
:::

## Pod disruption budgets

Every production workload MUST have a Pod Disruption Budget (PDB). Without a PDB, Kubernetes will drain all your pods simultaneously during upgrades.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: my-app-pdb
spec:
  minAvailable: "50%"
  selector:
    matchLabels:
      app: my-app
```

:::warning The number one upgrade mistake

Not having PDBs, then wondering why upgrades cause downtime. During a node drain, Kubernetes evicts pods as fast as it can. Without a PDB, all replicas can be evicted simultaneously, causing a full outage.
:::

## Long-term support (LTS)

AKS Premium tier provides Long-Term Support: 24 months of patch support per minor version instead of the standard 12 months. Use LTS when:

- You have compliance requirements that prevent frequent version changes
- Your application has hard dependencies on specific K8s API versions
- You operate in regulated industries with long change-control cycles

LTS does not mean you should stop upgrading. It means you have breathing room.

## Upgrade verification strategy

Do not blindly trust that an upgrade succeeded. Validate after every upgrade.

```bash
# Check node versions after upgrade
kubectl get nodes -o custom-columns=NAME:.metadata.name,VERSION:.status.nodeInfo.kubeletVersion

# Verify all pods are running
kubectl get pods --all-namespaces --field-selector=status.phase!=Running,status.phase!=Succeeded

# Check for deprecated API usage before upgrading
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis
```

:::info Pre-upgrade checklist

1. Run `kubectl deprecations` (or `kubent`) to find deprecated APIs
2. Verify PDBs exist for all critical workloads
3. Confirm cluster autoscaler has headroom for surge nodes
4. Check that your subnet has enough free IPs for max-surge nodes
5. Test the upgrade in a non-prod cluster first using `rapid` channel
:::

## Rollback

AKS does not support downgrading Kubernetes versions. If an upgrade breaks something:

- Fix forward by patching your workloads to be compatible
- Restore from backup to a new cluster running the previous version
- Use Blue-Green cluster strategy: keep the old cluster until the new one is validated

This is why staging clusters with `rapid` channel matter. Catch breaking changes before they hit production.

## Common mistakes

1. **Using `none` channel** -- You will skip 3+ minor versions, then discover breaking API removals all at once
2. **No PDBs** -- Upgrades become unplanned outages
3. **No maintenance window** -- Upgrades happen during peak traffic
4. **Ignoring node image upgrades** -- Your nodes accumulate unpatched CVEs
5. **Setting max-surge to 100%** -- Doubles your node count temporarily and can exhaust subnet IPs
6. **Not checking deprecated APIs** -- Upgrade succeeds but workloads break because manifests use removed APIs
7. **Upgrading production first** -- Always upgrade non-prod first. Always.
8. **Still running Azure Linux 2.0** -- End of support was November 30, 2025. Node images are frozen. Migrate to Azure Linux 3 (AzureLinux3) immediately.

## Resources

- [Upgrade AKS Clusters](https://learn.microsoft.com/en-us/azure/aks/upgrade-cluster)
- [Auto-upgrade Channels](https://learn.microsoft.com/en-us/azure/aks/auto-upgrade-cluster)
- [Planned Maintenance Windows](https://learn.microsoft.com/en-us/azure/aks/planned-maintenance)
- [Node OS Auto-upgrade](https://learn.microsoft.com/en-us/azure/aks/auto-upgrade-node-os-image)
- [AKS Long-Term Support](https://learn.microsoft.com/en-us/azure/aks/long-term-support)
