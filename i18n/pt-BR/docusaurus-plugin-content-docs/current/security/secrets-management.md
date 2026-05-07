---
sidebar_position: 5
title: "Gerenciamento de Secrets"
description: "Gerenciamento seguro de secrets com Azure Key Vault, CSI Secrets Store Driver e autenticação via Workload Identity."
---

# Gerenciamento de secrets

Use Azure Key Vault com o Secrets Store CSI Driver. Ponto final. Não confie em Kubernetes Secrets nativos para dados sensíveis. Eles são codificados em base64 (não criptografados), armazenados no etcd e visíveis a qualquer pessoa com acesso de leitura a Secrets no namespace.

## O problema com Kubernetes secrets

```bash
# This is all it takes to read a "secret"
kubectl get secret db-credentials -o jsonpath='{.data.password}' | base64 -d
```

Isso não é segurança. Isso é codificação. Kubernetes Secrets são:
- Não criptografados em repouso por padrão (armazenados como texto puro no etcd)
- Legíveis por qualquer pessoa com acesso RBAC a secrets no namespace
- Visíveis em specs de pod, variáveis de ambiente e logs de auditoria
- Sem versionamento, sem rotação automática, sem auditoria

:::warning

Nunca trate Kubernetes Secrets como armazenamento seguro. No melhor caso, são um recurso de conveniência para configurações não sensíveis. Para secrets reais (senhas de banco de dados, chaves de API, certificados, connection strings), use Azure Key Vault.
:::

## A solução: duas abordagens

| Abordagem | Como Funciona | Quando Usar |
|-----------|--------------|-------------|
| Secrets Store CSI Driver | Monta secrets do Key Vault como arquivos diretamente nos pods | Aplicações novas. App lê secrets do filesystem. |
| External Secrets Operator | Sincroniza secrets do Key Vault em objetos Kubernetes Secret | Apps legados que precisam ler de objetos K8s Secret ou variáveis de ambiente |

:::tip

Use CSI Driver para aplicações novas. Use External Secrets Operator apenas se sua aplicação está codificada para ler de objetos Kubernetes Secret ou variáveis de ambiente e você não pode mudar isso. O CSI Driver é a arquitetura mais limpa -- secrets nunca existem como objetos Kubernetes.
:::

## Setup do secrets store CSI driver

### 1. Habilitar o addon

```bash
az aks enable-addons \
  --resource-group myRG \
  --name myCluster \
  --addons azure-keyvault-secrets-provider
```

### 2. Criar o Key Vault e armazenar um secret

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

### 3. Conceder acesso via workload identity

Nunca use access policies ou chaves compartilhadas. Use Workload Identity combinado com Key Vault RBAC:

```bash
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee "${MI_CLIENT_ID}" \
  --scope "/subscriptions/<sub>/resourceGroups/myRG/providers/Microsoft.KeyVault/vaults/myapp-kv"
```

### 4. Criar o SecretProviderClass

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

### 5. Montar no seu pod

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

Sua aplicação lê `/mnt/secrets/db-password` como um arquivo. Limpo, simples, sem objetos Kubernetes Secret envolvidos.

## Rotação

O CSI Driver suporta rotação automática. Habilite:

```bash
az aks enable-addons \
  --resource-group myRG \
  --name myCluster \
  --addons azure-keyvault-secrets-provider \
  --enable-secret-rotation \
  --rotation-poll-interval 2m
```

O driver consulta o Key Vault e atualiza os arquivos montados. Sua aplicação deve ser capaz de reler secrets sem reiniciar (ou usar um file watcher).

## A cadeia de autenticação

Nunca coloque credenciais fixas no código para acessar o Key Vault. O caminho de autenticação é:

Pod -> Workload Identity -> Managed Identity -> Key Vault RBAC -> Secret

Se o seu SecretProviderClass referencia um client secret ou service principal, você está anulando totalmente o propósito. Você está armazenando um secret para acessar seu armazenamento de secrets.

## Erros comuns

1. **Armazenar secrets em Kubernetes Secrets "temporariamente"** -- Não existe temporário. Fica lá para sempre até alguém deletar manualmente. Use Key Vault desde o primeiro dia.
2. **Usar access policies do Key Vault em vez de RBAC** -- Access policies são legado. Habilite autorização RBAC no Key Vault (`--enable-rbac-authorization`) e use roles do Azure.
3. **Usar service principal para autenticar no Key Vault** -- Isso exige armazenar credenciais de cliente em algum lugar. Use Workload Identity. Zero secrets para gerenciar secrets.
4. **Não habilitar soft-delete e purge protection** -- Exclusão acidental de secrets do Key Vault sem esses recursos significa perda permanente de dados. Sempre habilite ambos.
5. **Fazer commit de secrets no git** -- Óbvio, mas ainda acontece. Use pre-commit hooks (como `detect-secrets`) para escanear strings de alta entropia e padrões conhecidos de secrets.
6. **Definir secrets como variáveis de ambiente** -- Variáveis de ambiente aparecem em listagens de processos, crash dumps e endpoints de debug. Monte como arquivos.

## Árvore de decisão

![Árvore de Decisão de Gerenciamento de Secrets](/img/secrets-decision-tree.svg)

## Recursos

- [CSI Secrets Store Driver in AKS](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-driver)
- [Azure Key Vault Provider for Secrets Store CSI](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-identity-access)
- [External Secrets Operator](https://external-secrets.io/latest/provider/azure-key-vault/)
- [Key Vault RBAC Authorization](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide)
- [Workload Identity with Key Vault](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-identity-access#access-with-a-workload-identity)
