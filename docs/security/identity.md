---
sidebar_position: 1
title: "Identity and Access Management"
description: "Entra ID integration, Azure RBAC for Kubernetes, and managed identity strategy for AKS clusters."
---

# Identity and Access Management

Entra ID integration is THE way to manage access to AKS. There is no debate here. If you are using local accounts or certificate-based auth in production, you are doing it wrong and creating an audit nightmare.

## The Rule

Never use local Kubernetes accounts. Disable them. Use Entra ID combined with Kubernetes RBAC for every cluster, every environment, no exceptions.

:::warning

Local accounts cannot be audited through Entra ID, cannot enforce MFA, and cannot be revoked centrally. A compromised kubeconfig with local admin credentials gives permanent cluster access until you rotate the certificates.
:::

## Create a Cluster the Right Way

```bash
az aks create \
  --resource-group myRG \
  --name myCluster \
  --enable-aad \
  --enable-azure-rbac \
  --aad-admin-group-object-ids "<entra-group-id>" \
  --disable-local-accounts \
  --assign-identity "<user-assigned-mi-resource-id>" \
  --node-resource-group "MC_myRG_myCluster_eastus"
```

Every flag matters. `--enable-aad` turns on Entra ID integration. `--enable-azure-rbac` maps Azure roles directly to Kubernetes RBAC so you manage everything from one control plane. `--disable-local-accounts` eliminates the backdoor.

## Azure RBAC for Kubernetes: The Decision

| Approach | When to Use | Verdict |
|----------|-------------|---------|
| Azure RBAC for K8s | Production, enterprise | Use this. Single control plane for Azure and K8s permissions |
| Kubernetes RBAC only | Never in production | Forces separate RoleBindings, no Entra ID audit trail |
| Azure RBAC + K8s RBAC | Complex multi-tenant | Acceptable if Azure RBAC alone is too coarse |

With Azure RBAC for Kubernetes, you assign roles like `Azure Kubernetes Service RBAC Reader` or `Azure Kubernetes Service RBAC Writer` at scope levels (cluster, namespace). No separate RoleBindings needed.

```bash
# Give a team namespace-scoped write access
az role assignment create \
  --role "Azure Kubernetes Service RBAC Writer" \
  --assignee "<entra-group-id>" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/<cluster>/namespaces/team-a"
```

## Managed Identity for the Cluster

The cluster itself needs an identity to manage Azure resources (load balancers, disks, networking). You have two options:

| Identity Type | Pros | Cons | Recommendation |
|---------------|------|------|----------------|
| System-assigned | Zero setup, auto-created | Dies with the cluster, cannot pre-assign permissions | Dev/test only |
| User-assigned | Survives recreation, reusable, pre-configurable | Slightly more setup | Production always |

:::tip

Use user-assigned managed identity for production clusters. When you recreate a cluster (and you will -- upgrades, DR testing, IaC reprovisioning), the identity persists with all its role assignments intact. System-assigned identity means re-doing every RBAC assignment from scratch.
:::

## Break-Glass Access

You disabled local accounts (good). But you need an emergency path when Entra ID has issues.

1. Create a dedicated Entra ID security group called `aks-emergency-admins`
2. Add only 2-3 senior platform engineers
3. Assign `Azure Kubernetes Service Cluster Admin` role to this group
4. Monitor membership changes with Entra ID access reviews
5. Document the break-glass procedure in your runbook

```bash
# Re-enable local accounts in true emergency only
az aks update --resource-group myRG --name myCluster --enable-local-accounts
# Get credentials
az aks get-credentials --resource-group myRG --name myCluster --admin
# Fix the issue, then disable again
az aks update --resource-group myRG --name myCluster --disable-local-accounts
```

## Conditional Access: Require MFA for Cluster Access

Entra ID Conditional Access policies apply to AKS authentication. This means you can require MFA, compliant devices, or restrict access to specific network locations for anyone running kubectl.

Configure a Conditional Access policy targeting the "Azure Kubernetes Service AAD Server" application in your Entra ID tenant. Require MFA and a compliant device for all users except the emergency admin group.

:::info

Conditional Access applies at token acquisition time. Once a user has a valid token (typically 1 hour), they can access the cluster without re-authentication until it expires. Plan your token lifetime accordingly.
:::

## Available Azure RBAC Roles for Kubernetes

| Role | Scope | What It Grants |
|------|-------|----------------|
| Azure Kubernetes Service Cluster Admin | Cluster | Full admin, equivalent to cluster-admin ClusterRole |
| Azure Kubernetes Service RBAC Admin | Cluster/Namespace | Manage all resources including RBAC bindings |
| Azure Kubernetes Service RBAC Writer | Cluster/Namespace | Read/write on most resources, no RBAC management |
| Azure Kubernetes Service RBAC Reader | Cluster/Namespace | Read-only access to most resources |

Start with Reader for all developers. Promote to Writer only for namespaces they own. Admin and Cluster Admin should be reserved for platform teams only.

## Common Mistakes

1. **Leaving local accounts enabled "just in case"** -- This is a backdoor. Disable them and use the break-glass procedure instead.
2. **Using system-assigned MI for production** -- You will lose all role assignments when the cluster is recreated.
3. **Not scoping RBAC to namespaces** -- Giving cluster-wide writer access when teams only need namespace access violates least privilege.
4. **Skipping Entra ID groups** -- Assigning roles to individual users instead of groups creates unmaintainable sprawl.
5. **Forgetting conditional access** -- Entra ID supports requiring MFA, compliant devices, or specific locations for cluster access. Use it.
6. **Not reviewing access regularly** -- Use Entra ID access reviews to periodically validate that group memberships are still appropriate. People change teams; permissions should follow.

## Resources

- [Entra ID Integration with AKS](https://learn.microsoft.com/en-us/azure/aks/azure-ad-integration-cli)
- [Azure RBAC for Kubernetes Authorization](https://learn.microsoft.com/en-us/azure/aks/manage-azure-rbac)
- [Disable Local Accounts](https://learn.microsoft.com/en-us/azure/aks/managed-aad#disable-local-accounts)
- [AKS Managed Identity](https://learn.microsoft.com/en-us/azure/aks/use-managed-identity)
