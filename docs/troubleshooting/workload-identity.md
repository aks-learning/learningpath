---
sidebar_position: 2
title: "Workload Identity troubleshooting"
description: "Decision tree for diagnosing Azure Workload Identity authentication failures in AKS pods."
---

# Workload Identity troubleshooting

Workload Identity failures are silent. Your pod starts, tries to get an Azure token, fails, and throws a generic "authentication failed" error with no useful context. This guide walks you through every checkpoint in order.

## Start here

Your pod logs show one of these:
- `DefaultAzureCredential failed to retrieve a token`
- `ClientAssertionCredential authentication failed`
- `AADSTS700024: Client assertion is not within its valid time range`
- `ManagedIdentityCredential authentication unavailable`
- Generic 401/403 when calling Azure services

Run this first:

```bash
kubectl describe pod <pod> -n <ns>
```

Look for:
- Is the `azure-identity-token` volume mounted?
- Is the `AZURE_CLIENT_ID` environment variable set?
- Is the `AZURE_TENANT_ID` environment variable set?
- Is the `AZURE_FEDERATED_TOKEN_FILE` environment variable set?

If any of these are missing, the mutating webhook did not inject the Workload Identity configuration. Start at checkpoint 1.

---

## Checkpoint 1: cluster OIDC and Workload Identity enabled

```bash
az aks show --resource-group myRG --name myAKS \
  --query "{oidcIssuer:oidcIssuerProfile.issuerUrl, workloadIdentity:securityProfile.workloadIdentity.enabled}" -o json
```

| Result | Action |
|---|---|
| `oidcIssuer: null` | Run `az aks update --resource-group myRG --name myAKS --enable-oidc-issuer` |
| `workloadIdentity: null` or `false` | Run `az aks update --resource-group myRG --name myAKS --enable-workload-identity` |
| Both present and `true` | Proceed to checkpoint 2 |

:::warning

After enabling OIDC or Workload Identity on an existing cluster, you must restart the pods that need it. The mutating webhook only injects configuration when a pod is created.
:::

---

## Checkpoint 2: pod label

The mutating admission webhook only injects the token volume and environment variables if the **pod** has this label:

```yaml
metadata:
  labels:
    azure.workload.identity/use: "true"
```

**Common mistake**: putting the label on the Deployment metadata but not on the pod template.

```yaml
# WRONG -- label on Deployment, not on pod template
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    azure.workload.identity/use: "true"  # This does nothing

# CORRECT -- label on pod template
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    metadata:
      labels:
        azure.workload.identity/use: "true"  # This is what the webhook reads
```

**Verify:**
```bash
kubectl get pod <pod> -n <ns> -o jsonpath='{.metadata.labels.azure\.workload\.identity/use}'
# Should output: true
```

If missing, fix the Deployment spec and redeploy.

---

## Checkpoint 3: service account annotation

The Kubernetes ServiceAccount must have the `azure.workload.identity/client-id` annotation:

```bash
kubectl get sa <sa-name> -n <ns> -o jsonpath='{.metadata.annotations.azure\.workload\.identity/client-id}'
```

| Result | Action |
|---|---|
| Empty or missing | Add the annotation with the managed identity client ID |
| Returns a GUID | Verify it matches the managed identity. Proceed to checkpoint 4 |

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp-sa
  namespace: myapp-ns
  annotations:
    azure.workload.identity/client-id: "<managed-identity-client-id>"
  labels:
    azure.workload.identity/use: "true"
```

---

## Checkpoint 4: managed identity exists

```bash
az identity show --resource-group myRG --name myIdentity \
  --query "{clientId:clientId, principalId:principalId, tenantId:tenantId}" -o json
```

If the identity does not exist, create it:

```bash
az identity create --resource-group myRG --name myIdentity --location eastus
```

Save the `clientId` -- you need it for the ServiceAccount annotation and federated credential.

---

## Checkpoint 5: federated credential

This is where most failures happen. The federated credential creates the trust between the Kubernetes ServiceAccount and the Azure Managed Identity.

```bash
az identity federated-credential list \
  --identity-name myIdentity \
  --resource-group myRG \
  --query "[].{name:name, issuer:issuer, subject:subject, audiences:audiences}" -o table
```

**Every field must match exactly:**

| Field | Expected value | How to find it |
|---|---|---|
| `issuer` | The AKS OIDC issuer URL | `az aks show -g myRG -n myAKS --query oidcIssuerProfile.issuerUrl -o tsv` |
| `subject` | `system:serviceaccount:<namespace>:<sa-name>` | Must match the actual namespace and ServiceAccount name |
| `audiences` | `["api://AzureADTokenExchange"]` | This is the default. Do not change it unless you know why. |

### Subject mismatch (most common failure)

The subject must be exactly `system:serviceaccount:<namespace>:<service-account-name>`.

Common mistakes:
- Wrong namespace: `system:serviceaccount:default:myapp-sa` when the app is in `myapp-ns`
- Wrong SA name: `system:serviceaccount:myapp-ns:myapp` when the SA is named `myapp-sa`
- Extra spaces or quotes in the subject string
- Using the Deployment name instead of the ServiceAccount name

**Fix:**
```bash
# Delete the wrong federated credential
az identity federated-credential delete \
  --identity-name myIdentity \
  --resource-group myRG \
  --name fc-myapp

# Create with the correct subject
export AKS_OIDC_ISSUER=$(az aks show -g myRG -n myAKS --query oidcIssuerProfile.issuerUrl -o tsv)

az identity federated-credential create \
  --name fc-myapp \
  --identity-name myIdentity \
  --resource-group myRG \
  --issuer "${AKS_OIDC_ISSUER}" \
  --subject "system:serviceaccount:myapp-ns:myapp-sa" \
  --audiences "api://AzureADTokenExchange"
```

:::tip

After creating or updating a federated credential, it can take up to 5 minutes for the change to propagate. If auth still fails immediately after creating the credential, wait and retry.
:::

---

## Checkpoint 6: Azure RBAC assignment

The managed identity must have the correct role on the target resource.

```bash
az role assignment list --assignee <managed-identity-principal-id> --all -o table
```

| Symptom | Fix |
|---|---|
| No role assignments | Assign the minimum required role on the target resource |
| Role is at wrong scope (subscription instead of resource) | Re-create at the correct scope. Use resource-level, not subscription-level. |
| Wrong role (Reader instead of Contributor) | Assign the correct role |

```bash
# Example: grant Storage Blob Data Reader
az role assignment create \
  --role "Storage Blob Data Reader" \
  --assignee <client-id> \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Storage/storageAccounts/<account>"
```

:::warning

Role assignment propagation can take up to 10 minutes. If you just created a role assignment and auth fails with 403, wait before debugging further.
:::

---

## Checkpoint 7: SDK configuration

The Azure Identity SDK must be using `WorkloadIdentityCredential` or `DefaultAzureCredential`.

### Common SDK issues

| Issue | Symptom | Fix |
|---|---|---|
| Old SDK version | `WorkloadIdentityCredential` not recognized | Update to latest `azure-identity` package |
| `AZURE_CLIENT_SECRET` is set | `DefaultAzureCredential` uses `ClientSecretCredential` instead of `WorkloadIdentityCredential` | Remove the environment variable. WI does not need secrets. |
| Explicit `ClientSecretCredential` in code | Bypasses Workload Identity entirely | Replace with `DefaultAzureCredential()` or `WorkloadIdentityCredential()` |
| Token caching issue | Works once, fails after token expires | Update SDK. Old versions had token refresh bugs. |

### SDK minimum versions

| Language | Package | Minimum version |
|----------|---------|----------------|
| .NET | `Azure.Identity` | 1.9.0+ |
| Python | `azure-identity` | 1.14.0+ |
| Java | `azure-identity` | 1.10.0+ |
| JavaScript | `@azure/identity` | 3.3.0+ |
| Go | `azidentity` | 1.4.0+ |

---

## Complete diagnosis script

Run this to check all checkpoints at once:

```bash
RG="myRG"
CLUSTER="myAKS"
NAMESPACE="myapp-ns"
SA_NAME="myapp-sa"
IDENTITY_NAME="myIdentity"

echo "=== Checkpoint 1: Cluster OIDC + WI ==="
az aks show -g $RG -n $CLUSTER \
  --query "{oidc:oidcIssuerProfile.issuerUrl, wi:securityProfile.workloadIdentity.enabled}" -o json

echo "=== Checkpoint 3: ServiceAccount annotation ==="
kubectl get sa $SA_NAME -n $NAMESPACE \
  -o jsonpath='{.metadata.annotations.azure\.workload\.identity/client-id}'
echo ""

echo "=== Checkpoint 4: Managed Identity ==="
az identity show -g $RG -n $IDENTITY_NAME \
  --query "{clientId:clientId, principalId:principalId}" -o json

echo "=== Checkpoint 5: Federated Credentials ==="
az identity federated-credential list -g $RG --identity-name $IDENTITY_NAME \
  --query "[].{name:name, subject:subject}" -o table

echo "=== Checkpoint 6: Role Assignments ==="
PRINCIPAL_ID=$(az identity show -g $RG -n $IDENTITY_NAME --query principalId -o tsv)
az role assignment list --assignee $PRINCIPAL_ID --all -o table

echo "=== Pod environment (checkpoint 2) ==="
POD=$(kubectl get pods -n $NAMESPACE -l azure.workload.identity/use=true -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$POD" ]; then
  kubectl exec $POD -n $NAMESPACE -- env | grep -E "AZURE_|IDENTITY" 2>/dev/null || echo "Cannot exec into pod"
else
  echo "No pod found with workload identity label"
fi
```

## Resources

- [Workload Identity Overview](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [Troubleshoot Workload Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-deploy-cluster)
- [Deploy and Configure Workload Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-deploy-cluster)
