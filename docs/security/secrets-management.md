---
sidebar_position: 5
title: "Secrets Management"
description: "Secure secrets management with Azure Key Vault, CSI Secrets Store Driver, and Workload Identity authentication."
---

# Secrets Management

Use Azure Key Vault with the Secrets Store CSI Driver. Period. Do not rely on native Kubernetes Secrets for sensitive data. They are base64-encoded (not encrypted), stored in etcd, and visible to anyone with Secret read access in the namespace.

## The Problem with Kubernetes Secrets

```bash
# This is all it takes to read a "secret"
kubectl get secret db-credentials -o jsonpath='{.data.password}' | base64 -d
```

That is not security. That is encoding. Kubernetes Secrets are:
- Not encrypted at rest by default (stored as plaintext in etcd)
- Readable by anyone with RBAC access to secrets in the namespace
- Visible in pod specs, environment variables, and audit logs
- Not versioned, not rotated automatically, not audited

:::warning

Never treat Kubernetes Secrets as secure storage. They are a convenience feature for non-sensitive configuration at best. For actual secrets (database passwords, API keys, certificates, connection strings), use Azure Key Vault.
:::

## The Solution: Two Approaches

| Approach | How It Works | When to Use |
|----------|-------------|-------------|
| Secrets Store CSI Driver | Mounts Key Vault secrets as files directly into pods | New applications. App reads secrets from filesystem. |
| External Secrets Operator | Syncs Key Vault secrets into Kubernetes Secret objects | Legacy apps that must read from K8s Secret objects or env vars |

:::tip

Use CSI Driver for new applications. Use External Secrets Operator only if your application is hard-coded to read from Kubernetes Secret objects or environment variables and you cannot change it. The CSI Driver is the cleaner architecture -- secrets never exist as Kubernetes objects.
:::

## Secrets Store CSI Driver Setup

### 1. Enable the Addon

```bash
az aks enable-addons \
  --resource-group myRG \
  --name myCluster \
  --addons azure-keyvault-secrets-provider
```

### 2. Create Key Vault and Store a Secret

```bash
az keyvault create \
  --resource-group myRG \
  --name myapp-kv \
  --location eastus \
  --enable-rbac-authorization

az keyvault secret set \
  --vault-name myapp-kv \
  --name db-password \
  --value "your-actual-secret-value"
```

### 3. Grant Access via Workload Identity

Never use access policies or shared keys. Use Workload Identity combined with Key Vault RBAC:

```bash
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee "${MI_CLIENT_ID}" \
  --scope "/subscriptions/<sub>/resourceGroups/myRG/providers/Microsoft.KeyVault/vaults/myapp-kv"
```

### 4. Create SecretProviderClass

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: myapp-secrets
  namespace: production
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    clientID: "<MI_CLIENT_ID>"
    keyvaultName: "myapp-kv"
    objects: |
      array:
        - |
          objectName: db-password
          objectType: secret
        - |
          objectName: api-key
          objectType: secret
        - |
          objectName: tls-cert
          objectType: secret
    tenantId: "<tenant-id>"
```

### 5. Mount in Your Pod

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: production
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
        volumeMounts:
        - name: secrets
          mountPath: "/mnt/secrets"
          readOnly: true
      volumes:
      - name: secrets
        csi:
          driver: secrets-store.csi.k8s.io
          readOnly: true
          volumeAttributes:
            secretProviderClass: "myapp-secrets"
```

Your app reads `/mnt/secrets/db-password` as a file. Clean, simple, no Kubernetes Secret objects involved.

## Rotation

The CSI Driver supports automatic rotation. Enable it:

```bash
az aks enable-addons \
  --resource-group myRG \
  --name myCluster \
  --addons azure-keyvault-secrets-provider \
  --enable-secret-rotation \
  --rotation-poll-interval 2m
```

The driver polls Key Vault and updates the mounted files. Your app must be able to re-read secrets without restart (or use a file watcher).

## The Authentication Chain

Never hardcode credentials to access Key Vault. The authentication path is:

Pod -> Workload Identity -> Managed Identity -> Key Vault RBAC -> Secret

If your SecretProviderClass references a client secret or service principal, you are defeating the purpose entirely. You are storing a secret to access your secret store.

## Common Mistakes

1. **Storing secrets in Kubernetes Secrets "temporarily"** -- There is no temporary. It stays forever until someone manually deletes it. Use Key Vault from day one.
2. **Using Key Vault access policies instead of RBAC** -- Access policies are legacy. Enable RBAC authorization on Key Vault (`--enable-rbac-authorization`) and use Azure roles.
3. **Using a service principal to authenticate to Key Vault** -- This requires storing client credentials somewhere. Use Workload Identity instead. Zero secrets to manage secrets.
4. **Not enabling soft-delete and purge protection** -- Accidental deletion of Key Vault secrets without these means permanent data loss. Always enable both.
5. **Committing secrets to git** -- Obvious but still happens. Use pre-commit hooks (like `detect-secrets`) to scan for high-entropy strings and known secret patterns.
6. **Setting secrets as environment variables** -- Environment variables appear in process listings, crash dumps, and debug endpoints. Mount as files instead.

## Decision Tree

![Secrets Management Decision Tree](/img/secrets-decision-tree.svg)

## Resources

- [CSI Secrets Store Driver in AKS](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-driver)
- [Azure Key Vault Provider for Secrets Store CSI](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-identity-access)
- [External Secrets Operator](https://external-secrets.io/latest/provider/azure-key-vault/)
- [Key Vault RBAC Authorization](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide)
- [Workload Identity with Key Vault](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-identity-access#access-with-a-workload-identity)
