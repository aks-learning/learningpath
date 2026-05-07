---
sidebar_position: 5
title: "Gerenciamento de Secrets"
description: "Gerenciamento seguro de secrets com Azure Key Vault, CSI Secrets Store Driver e autenticacao via Workload Identity."
---

# Gerenciamento de Secrets

Use Azure Key Vault com o Secrets Store CSI Driver. Ponto final. Nao confie em Kubernetes Secrets nativos para dados sensiveis. Eles sao codificados em base64 (nao criptografados), armazenados no etcd e visiveis a qualquer pessoa com acesso de leitura a Secrets no namespace.

## O Problema com Kubernetes Secrets

```bash
# This is all it takes to read a "secret"
kubectl get secret db-credentials -o jsonpath='{.data.password}' | base64 -d
```

Isso nao e seguranca. Isso e codificacao. Kubernetes Secrets sao:
- Nao criptografados em repouso por padrao (armazenados como texto puro no etcd)
- Legiveis por qualquer pessoa com acesso RBAC a secrets no namespace
- Visiveis em specs de pod, variaveis de ambiente e logs de auditoria
- Sem versionamento, sem rotacao automatica, sem auditoria

:::warning

Nunca trate Kubernetes Secrets como armazenamento seguro. No melhor caso, sao um recurso de conveniencia para configuracoes nao sensiveis. Para secrets reais (senhas de banco de dados, chaves de API, certificados, connection strings), use Azure Key Vault.
:::

## A Solucao: Duas Abordagens

| Abordagem | Como Funciona | Quando Usar |
|-----------|--------------|-------------|
| Secrets Store CSI Driver | Monta secrets do Key Vault como arquivos diretamente nos pods | Aplicacoes novas. App le secrets do filesystem. |
| External Secrets Operator | Sincroniza secrets do Key Vault em objetos Kubernetes Secret | Apps legados que precisam ler de objetos K8s Secret ou variaveis de ambiente |

:::tip

Use CSI Driver para aplicacoes novas. Use External Secrets Operator apenas se sua aplicacao esta codificada para ler de objetos Kubernetes Secret ou variaveis de ambiente e voce nao pode mudar isso. O CSI Driver e a arquitetura mais limpa -- secrets nunca existem como objetos Kubernetes.
:::

## Setup do Secrets Store CSI Driver

### 1. Habilitar o Addon

```bash
az aks enable-addons \
  --resource-group myRG \
  --name myCluster \
  --addons azure-keyvault-secrets-provider
```

### 2. Criar o Key Vault e Armazenar um Secret

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

### 3. Conceder Acesso via Workload Identity

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

### 5. Montar no Seu Pod

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

Sua aplicacao le `/mnt/secrets/db-password` como um arquivo. Limpo, simples, sem objetos Kubernetes Secret envolvidos.

## Rotacao

O CSI Driver suporta rotacao automatica. Habilite:

```bash
az aks enable-addons \
  --resource-group myRG \
  --name myCluster \
  --addons azure-keyvault-secrets-provider \
  --enable-secret-rotation \
  --rotation-poll-interval 2m
```

O driver consulta o Key Vault e atualiza os arquivos montados. Sua aplicacao deve ser capaz de reler secrets sem reiniciar (ou usar um file watcher).

## A Cadeia de Autenticacao

Nunca coloque credenciais fixas no codigo para acessar o Key Vault. O caminho de autenticacao e:

Pod -> Workload Identity -> Managed Identity -> Key Vault RBAC -> Secret

Se o seu SecretProviderClass referencia um client secret ou service principal, voce esta anulando totalmente o proposito. Voce esta armazenando um secret para acessar seu armazenamento de secrets.

## Erros Comuns

1. **Armazenar secrets em Kubernetes Secrets "temporariamente"** -- Nao existe temporario. Fica la para sempre ate alguem deletar manualmente. Use Key Vault desde o primeiro dia.
2. **Usar access policies do Key Vault em vez de RBAC** -- Access policies sao legado. Habilite autorizacao RBAC no Key Vault (`--enable-rbac-authorization`) e use roles do Azure.
3. **Usar service principal para autenticar no Key Vault** -- Isso exige armazenar credenciais de cliente em algum lugar. Use Workload Identity. Zero secrets para gerenciar secrets.
4. **Nao habilitar soft-delete e purge protection** -- Exclusao acidental de secrets do Key Vault sem esses recursos significa perda permanente de dados. Sempre habilite ambos.
5. **Fazer commit de secrets no git** -- Obvio, mas ainda acontece. Use pre-commit hooks (como `detect-secrets`) para escanear strings de alta entropia e padroes conhecidos de secrets.
6. **Definir secrets como variaveis de ambiente** -- Variaveis de ambiente aparecem em listagens de processos, crash dumps e endpoints de debug. Monte como arquivos.

## Arvore de Decisao

![Arvore de Decisao de Gerenciamento de Secrets](/img/secrets-decision-tree.svg)

## Recursos

- [CSI Secrets Store Driver in AKS](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-driver)
- [Azure Key Vault Provider for Secrets Store CSI](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-identity-access)
- [External Secrets Operator](https://external-secrets.io/latest/provider/azure-key-vault/)
- [Key Vault RBAC Authorization](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide)
- [Workload Identity with Key Vault](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-identity-access#access-with-a-workload-identity)
