---
sidebar_position: 2
title: "Workload Identity"
description: "Configure Azure Workload Identity for pods to securely access Azure resources without secrets using OIDC federation."
---

# Workload Identity

Workload Identity is THE modern way for pods to access Azure resources. Every pod that talks to Azure MUST use Workload Identity. Zero exceptions. No more secrets in environment variables, no more connection strings stored in ConfigMaps, no more service principal credentials rotting in Key Vault.

## What It Replaces (and Why)

| Old Approach | Problem | Status |
|---|---|---|
| Pod Identity (aad-pod-identity) | NMI pod was a single point of failure, 200ms+ latency on token fetch, required host networking | Deprecated. Do not use. |
| Service principal secrets in pods | Credentials that expire, must be rotated, can be leaked in logs | Terrible. Stop immediately. |
| Connection strings in env vars | Plaintext credentials in pod spec visible to anyone with pod read access | Worse. Unacceptable. |
| Managed Identity on VMSS directly | Every pod on the node gets the same identity. Zero isolation. | Dangerous for multi-tenant. |

:::warning

Pod Identity (aad-pod-identity) is deprecated and will not receive security patches. If you are still using it, migrate to Workload Identity now. Not next sprint. Now.
:::

## How It Works

The chain is simple and elegant:

1. Kubernetes Service Account gets an OIDC token from the AKS OIDC issuer
2. A Federated Credential on the Managed Identity trusts that specific issuer + namespace + service account
3. The pod exchanges the K8s token for an Azure AD token via the Azure Identity SDK
4. The pod authenticates to Azure resources using standard Azure RBAC

No secrets are stored anywhere. The trust is based on cryptographic federation.

## Step-by-Step Setup

### 1. Enable on the Cluster

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --enable-oidc-issuer \
  --enable-workload-identity
```

### 2. Create a Managed Identity

```bash
az identity create \
  --resource-group myRG \
  --name wi-myapp-identity \
  --location eastus

# Get the client ID
export MI_CLIENT_ID=$(az identity show --resource-group myRG --name wi-myapp-identity --query clientId -o tsv)
```

### 3. Create the Federated Credential

```bash
export AKS_OIDC_ISSUER=$(az aks show --resource-group myRG --name myCluster --query "oidcIssuerProfile.issuerUrl" -o tsv)

az identity federated-credential create \
  --name fc-myapp \
  --identity-name wi-myapp-identity \
  --resource-group myRG \
  --issuer "${AKS_OIDC_ISSUER}" \
  --subject "system:serviceaccount:myapp-namespace:myapp-sa" \
  --audiences "api://AzureADTokenExchange"
```

:::tip

The `--subject` must exactly match the format `system:serviceaccount:<namespace>:<service-account-name>`. A single typo here means silent authentication failures with no useful error message. Triple-check it.
:::

### 4. Create the Kubernetes Service Account

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp-sa
  namespace: myapp-namespace
  annotations:
    azure.workload.identity/client-id: "<MI_CLIENT_ID>"
  labels:
    azure.workload.identity/use: "true"
```

### 5. Deploy Your Pod

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: myapp-namespace
spec:
  template:
    metadata:
      labels:
        azure.workload.identity/use: "true"
    spec:
      serviceAccountName: myapp-sa
      containers:
      - name: myapp
        image: myregistry.azurecr.io/myapp:latest
        # No secrets needed -- Azure Identity SDK handles token acquisition
```

### 6. Grant Azure Permissions

```bash
az role assignment create \
  --role "Storage Blob Data Reader" \
  --assignee "${MI_CLIENT_ID}" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Storage/storageAccounts/<account>"
```

## Common Mistakes

1. **Forgetting the label on the pod template** -- The `azure.workload.identity/use: "true"` label must be on the pod spec (not just the ServiceAccount). Without it, the mutating webhook does not inject the token volume.
2. **Namespace mismatch in federated credential** -- The subject in the federated credential must match the namespace where the ServiceAccount actually lives. Moving your app to a different namespace breaks auth silently.
3. **Using DefaultAzureCredential without understanding the chain** -- `DefaultAzureCredential` tries multiple auth methods. In a pod with Workload Identity, it should pick up `WorkloadIdentityCredential` automatically. But if other environment variables (like `AZURE_CLIENT_SECRET`) are set, it may use those instead.
4. **One identity for all pods** -- Create separate managed identities per workload. Sharing one identity across multiple apps violates least privilege.
5. **Not testing locally** -- Use `azd auth login` or `az login` locally. The Azure Identity SDK falls back to CLI credentials in dev, so your code works both locally and in-cluster without changes.

## Decision: One Identity Per Workload

Do not share managed identities across workloads. Each application that accesses Azure resources should have its own managed identity with exactly the permissions it needs. The overhead of creating additional identities is negligible compared to the blast radius of a shared over-privileged identity.

## Resources

- [Azure Workload Identity Overview](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [Deploy and Configure Workload Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-deploy-cluster)
- [Migrate from Pod Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-migrate-from-pod-identity)
- [Azure Identity SDK for .NET](https://learn.microsoft.com/en-us/dotnet/api/azure.identity)
- [Azure Identity SDK for Python](https://learn.microsoft.com/en-us/python/api/azure-identity/azure.identity)
