---
sidebar_position: 2
title: "Workload Identity"
description: "Configure Azure Workload Identity para que pods acessem recursos do Azure de forma segura sem secrets, usando federação OIDC."
---

# Workload identity

Workload Identity é A forma moderna para pods acessarem recursos do Azure. Todo pod que se comunica com o Azure DEVE usar Workload Identity. Zero exceções. Chega de secrets em variáveis de ambiente, chega de connection strings armazenadas em ConfigMaps, chega de credenciais de service principal apodrecendo no Key Vault.

## O que substitui (e por que)

| Abordagem Antiga | Problema | Status |
|---|---|---|
| Pod Identity (aad-pod-identity) | O pod NMI era um ponto único de falha, 200ms+ de latência na obtenção de token, exigia host networking | Descontinuado. Não use. |
| Secrets de service principal nos pods | Credenciais que expiram, precisam ser rotacionadas, podem vazar nos logs | Péssimo. Pare imediatamente. |
| Connection strings em variáveis de ambiente | Credenciais em texto puro na spec do pod, visíveis a qualquer um com acesso de leitura ao pod | Pior ainda. Inaceitável. |
| Managed Identity diretamente no VMSS | Todo pod no node recebe a mesma identidade. Zero isolamento. | Perigoso para multi-tenant. |

:::warning

Pod Identity (aad-pod-identity) está descontinuado e não receberá patches de segurança. Se você ainda está usando, migre para Workload Identity agora. Não no próximo sprint. Agora.
:::

## Como funciona

A cadeia é simples e elegante:

1. O Kubernetes Service Account recebe um token OIDC do emissor OIDC do AKS
2. Uma Federated Credential na Managed Identity confia naquele emissor + namespace + service account específicos
3. O pod troca o token do K8s por um token do Azure AD via Azure Identity SDK
4. O pod se autentica nos recursos do Azure usando Azure RBAC padrão

Nenhum secret é armazenado em lugar nenhum. A confiança é baseada em federação criptográfica.

## Passo a passo

### 1. Habilitar no cluster

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --enable-oidc-issuer \
  --enable-workload-identity
```

### 2. Criar uma managed identity

```bash
az identity create \
  --resource-group myRG \
  --name wi-myapp-identity \
  --location eastus

# Get the client ID
export MI_CLIENT_ID=$(az identity show --resource-group myRG --name wi-myapp-identity --query clientId -o tsv)
```

### 3. Criar a federated credential

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

O `--subject` deve corresponder exatamente ao formato `system:serviceaccount:<namespace>:<service-account-name>`. Um único erro de digitação aqui significa falhas silenciosas de autenticação sem mensagens de erro úteis. Verifique três vezes.
:::

### 4. Criar o Kubernetes service account

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

### 5. Fazer o deploy do seu pod

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

### 6. Conceder permissões no Azure

```bash
az role assignment create \
  --role "Storage Blob Data Reader" \
  --assignee "${MI_CLIENT_ID}" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Storage/storageAccounts/<account>"
```

## Erros comuns

1. **Esquecer o label no template do pod** -- O label `azure.workload.identity/use: "true"` deve estar na spec do pod (não apenas no ServiceAccount). Sem ele, o mutating webhook não injeta o volume de token.
2. **Namespace divergente na federated credential** -- O subject na federated credential deve corresponder ao namespace onde o ServiceAccount realmente está. Mover seu app para um namespace diferente quebra a autenticação silenciosamente.
3. **Usar DefaultAzureCredential sem entender a cadeia** -- `DefaultAzureCredential` tenta múltiplos métodos de autenticação. Em um pod com Workload Identity, ele deve pegar `WorkloadIdentityCredential` automaticamente. Mas se outras variáveis de ambiente (como `AZURE_CLIENT_SECRET`) estiverem definidas, ele pode usar essas.
4. **Uma identidade para todos os pods** -- Crie managed identities separadas por workload. Compartilhar uma identidade entre múltiplos apps viola o princípio de menor privilégio.
5. **Não testar localmente** -- Use `azd auth login` ou `az login` localmente. O Azure Identity SDK faz fallback para credenciais da CLI em dev, então seu código funciona tanto localmente quanto no cluster sem alterações.

## Decisão: uma identidade por workload

Não compartilhe managed identities entre workloads. Cada aplicação que acessa recursos do Azure deve ter sua própria managed identity com exatamente as permissões necessárias. O custo de criar identidades adicionais é insignificante comparado ao raio de explosão de uma identidade compartilhada com privilégios excessivos.

## Recursos

- [Azure Workload Identity Overview](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [Deploy and Configure Workload Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-deploy-cluster)
- [Migrate from Pod Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-migrate-from-pod-identity)
- [Azure Identity SDK for .NET](https://learn.microsoft.com/en-us/dotnet/api/azure.identity)
- [Azure Identity SDK for Python](https://learn.microsoft.com/en-us/python/api/azure-identity/azure.identity)
