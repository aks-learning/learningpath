---
sidebar_position: 2
title: "Workload Identity"
description: "Configure Azure Workload Identity para que pods acessem recursos do Azure de forma segura sem secrets, usando federacao OIDC."
---

# Workload Identity

Workload Identity e A forma moderna para pods acessarem recursos do Azure. Todo pod que se comunica com o Azure DEVE usar Workload Identity. Zero excecoes. Chega de secrets em variaveis de ambiente, chega de connection strings armazenadas em ConfigMaps, chega de credenciais de service principal apodrecendo no Key Vault.

## O Que Substitui (e Por Que)

| Abordagem Antiga | Problema | Status |
|---|---|---|
| Pod Identity (aad-pod-identity) | O pod NMI era um ponto unico de falha, 200ms+ de latencia na obtencao de token, exigia host networking | Descontinuado. Nao use. |
| Secrets de service principal nos pods | Credenciais que expiram, precisam ser rotacionadas, podem vazar nos logs | Pessimo. Pare imediatamente. |
| Connection strings em variaveis de ambiente | Credenciais em texto puro na spec do pod, visiveis a qualquer um com acesso de leitura ao pod | Pior ainda. Inaceitavel. |
| Managed Identity diretamente no VMSS | Todo pod no node recebe a mesma identidade. Zero isolamento. | Perigoso para multi-tenant. |

:::warning

Pod Identity (aad-pod-identity) esta descontinuado e nao recebera patches de seguranca. Se voce ainda esta usando, migre para Workload Identity agora. Nao no proximo sprint. Agora.
:::

## Como Funciona

A cadeia e simples e elegante:

1. O Kubernetes Service Account recebe um token OIDC do emissor OIDC do AKS
2. Uma Federated Credential na Managed Identity confia naquele emissor + namespace + service account especificos
3. O pod troca o token do K8s por um token do Azure AD via Azure Identity SDK
4. O pod se autentica nos recursos do Azure usando Azure RBAC padrao

Nenhum secret e armazenado em lugar nenhum. A confianca e baseada em federacao criptografica.

## Passo a Passo

### 1. Habilitar no Cluster

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --enable-oidc-issuer \
  --enable-workload-identity
```

### 2. Criar uma Managed Identity

```bash
az identity create \
  --resource-group myRG \
  --name wi-myapp-identity \
  --location eastus

# Get the client ID
export MI_CLIENT_ID=$(az identity show --resource-group myRG --name wi-myapp-identity --query clientId -o tsv)
```

### 3. Criar a Federated Credential

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

O `--subject` deve corresponder exatamente ao formato `system:serviceaccount:<namespace>:<service-account-name>`. Um unico erro de digitacao aqui significa falhas silenciosas de autenticacao sem mensagens de erro uteis. Verifique tres vezes.
:::

### 4. Criar o Kubernetes Service Account

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

### 5. Fazer o Deploy do Seu Pod

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

### 6. Conceder Permissoes no Azure

```bash
az role assignment create \
  --role "Storage Blob Data Reader" \
  --assignee "${MI_CLIENT_ID}" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Storage/storageAccounts/<account>"
```

## Erros Comuns

1. **Esquecer o label no template do pod** -- O label `azure.workload.identity/use: "true"` deve estar na spec do pod (nao apenas no ServiceAccount). Sem ele, o mutating webhook nao injeta o volume de token.
2. **Namespace divergente na federated credential** -- O subject na federated credential deve corresponder ao namespace onde o ServiceAccount realmente esta. Mover seu app para um namespace diferente quebra a autenticacao silenciosamente.
3. **Usar DefaultAzureCredential sem entender a cadeia** -- `DefaultAzureCredential` tenta multiplos metodos de autenticacao. Em um pod com Workload Identity, ele deve pegar `WorkloadIdentityCredential` automaticamente. Mas se outras variaveis de ambiente (como `AZURE_CLIENT_SECRET`) estiverem definidas, ele pode usar essas.
4. **Uma identidade para todos os pods** -- Crie managed identities separadas por workload. Compartilhar uma identidade entre multiplos apps viola o principio de menor privilegio.
5. **Nao testar localmente** -- Use `azd auth login` ou `az login` localmente. O Azure Identity SDK faz fallback para credenciais da CLI em dev, entao seu codigo funciona tanto localmente quanto no cluster sem alteracoes.

## Decisao: Uma Identidade Por Workload

Nao compartilhe managed identities entre workloads. Cada aplicacao que acessa recursos do Azure deve ter sua propria managed identity com exatamente as permissoes necessarias. O custo de criar identidades adicionais e insignificante comparado ao raio de explosao de uma identidade compartilhada com privilegios excessivos.

## Recursos

- [Azure Workload Identity Overview](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [Deploy and Configure Workload Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-deploy-cluster)
- [Migrate from Pod Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-migrate-from-pod-identity)
- [Azure Identity SDK for .NET](https://learn.microsoft.com/en-us/dotnet/api/azure.identity)
- [Azure Identity SDK for Python](https://learn.microsoft.com/en-us/python/api/azure-identity/azure.identity)
