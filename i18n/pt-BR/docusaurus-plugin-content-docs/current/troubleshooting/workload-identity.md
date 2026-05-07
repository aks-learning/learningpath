---
sidebar_position: 2
title: "Solução de problemas do Workload Identity"
description: "Árvore de decisão para diagnosticar falhas de autenticação do Azure Workload Identity em pods AKS."
---

# Solução de problemas do Workload Identity

Falhas de Workload Identity são silenciosas. Seu pod inicia, tenta obter um token do Azure, falha e lança um erro genérico de "authentication failed" sem contexto útil. Este guia percorre cada ponto de verificação em ordem.

## Comece aqui

Os logs do seu pod mostram um destes erros:
- `DefaultAzureCredential failed to retrieve a token`
- `ClientAssertionCredential authentication failed`
- `AADSTS700024: Client assertion is not within its valid time range`
- `ManagedIdentityCredential authentication unavailable`
- 401/403 genérico ao chamar serviços do Azure

Execute isto primeiro:

```bash
kubectl describe pod <pod> -n <ns>
```

Verifique:
- O volume `azure-identity-token` está montado?
- A variável de ambiente `AZURE_CLIENT_ID` está definida?
- A variável de ambiente `AZURE_TENANT_ID` está definida?
- A variável de ambiente `AZURE_FEDERATED_TOKEN_FILE` está definida?

Se alguma delas estiver ausente, o mutating webhook não injetou a configuração do Workload Identity. Comece no ponto de verificação 1.

---

## Ponto de verificação 1: OIDC e Workload Identity habilitados no cluster

```bash
az aks show --resource-group myRG --name myAKS \
  --query "{oidcIssuer:oidcIssuerProfile.issuerUrl, workloadIdentity:securityProfile.workloadIdentity.enabled}" -o json
```

| Resultado | Ação |
|---|---|
| `oidcIssuer: null` | Execute `az aks update --resource-group myRG --name myAKS --enable-oidc-issuer` |
| `workloadIdentity: null` ou `false` | Execute `az aks update --resource-group myRG --name myAKS --enable-workload-identity` |
| Ambos presentes e `true` | Prossiga para o ponto de verificação 2 |

:::warning

Após habilitar OIDC ou Workload Identity em um cluster existente, você deve reiniciar os pods que precisam dele. O mutating webhook só injeta a configuração quando um pod é criado.
:::

---

## Ponto de verificação 2: label do pod

O mutating admission webhook só injeta o volume de token e as variáveis de ambiente se o **pod** tiver este label:

```yaml
metadata:
  labels:
    azure.workload.identity/use: "true"
```

**Erro comum**: colocar o label no metadata do Deployment e não no template do pod.

```yaml
# ERRADO -- label no Deployment, não no template do pod
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    azure.workload.identity/use: "true"  # Isto não faz nada

# CORRETO -- label no template do pod
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    metadata:
      labels:
        azure.workload.identity/use: "true"  # Isto é o que o webhook lê
```

**Verifique:**
```bash
kubectl get pod <pod> -n <ns> -o jsonpath='{.metadata.labels.azure\.workload\.identity/use}'
# Should output: true
```

Se estiver ausente, corrija o spec do Deployment e faça o redeploy.

---

## Ponto de verificação 3: annotation do service account

O Kubernetes ServiceAccount deve ter a annotation `azure.workload.identity/client-id`:

```bash
kubectl get sa <sa-name> -n <ns> -o jsonpath='{.metadata.annotations.azure\.workload\.identity/client-id}'
```

| Resultado | Ação |
|---|---|
| Vazio ou ausente | Adicione a annotation com o client ID da managed identity |
| Retorna um GUID | Verifique se corresponde à managed identity. Prossiga para o ponto de verificação 4 |

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

## Ponto de verificação 4: managed identity existe

```bash
az identity show --resource-group myRG --name myIdentity \
  --query "{clientId:clientId, principalId:principalId, tenantId:tenantId}" -o json
```

Se a identidade não existir, crie-a:

```bash
az identity create --resource-group myRG --name myIdentity --location eastus
```

Salve o `clientId` -- você precisa dele para a annotation do ServiceAccount e a credencial federada.

---

## Ponto de verificação 5: credencial federada

É aqui que a maioria das falhas acontece. A credencial federada cria a relação de confiança entre o Kubernetes ServiceAccount e a Azure Managed Identity.

```bash
az identity federated-credential list \
  --identity-name myIdentity \
  --resource-group myRG \
  --query "[].{name:name, issuer:issuer, subject:subject, audiences:audiences}" -o table
```

**Cada campo deve corresponder exatamente:**

| Campo | Valor esperado | Como encontrar |
|---|---|---|
| `issuer` | A URL do OIDC issuer do AKS | `az aks show -g myRG -n myAKS --query oidcIssuerProfile.issuerUrl -o tsv` |
| `subject` | `system:serviceaccount:<namespace>:<sa-name>` | Deve corresponder ao namespace e nome do ServiceAccount reais |
| `audiences` | `["api://AzureADTokenExchange"]` | Este é o padrão. Não altere a menos que saiba o porquê. |

### Incompatibilidade de subject (falha mais comum)

O subject deve ser exatamente `system:serviceaccount:<namespace>:<service-account-name>`.

Erros comuns:
- Namespace errado: `system:serviceaccount:default:myapp-sa` quando a aplicação está em `myapp-ns`
- Nome do SA errado: `system:serviceaccount:myapp-ns:myapp` quando o SA se chama `myapp-sa`
- Espaços extras ou aspas na string do subject
- Usar o nome do Deployment ao invés do nome do ServiceAccount

**Correção:**
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

Após criar ou atualizar uma credencial federada, pode levar até 5 minutos para a alteração se propagar. Se a autenticação ainda falhar imediatamente após criar a credencial, aguarde e tente novamente.
:::

---

## Ponto de verificação 6: atribuição de RBAC do Azure

A managed identity deve ter a role correta no recurso de destino.

```bash
az role assignment list --assignee <managed-identity-principal-id> --all -o table
```

| Sintoma | Correção |
|---|---|
| Sem atribuições de role | Atribua a role mínima necessária no recurso de destino |
| Role no escopo errado (subscription ao invés do recurso) | Recrie no escopo correto. Use nível de recurso, não nível de subscription. |
| Role incorreta (Reader ao invés de Contributor) | Atribua a role correta |

```bash
# Example: grant Storage Blob Data Reader
az role assignment create \
  --role "Storage Blob Data Reader" \
  --assignee <client-id> \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Storage/storageAccounts/<account>"
```

:::warning

A propagação de atribuição de role pode levar até 10 minutos. Se você acabou de criar uma atribuição de role e a autenticação falha com 403, aguarde antes de continuar a depuração.
:::

---

## Ponto de verificação 7: configuração do SDK

O Azure Identity SDK deve estar usando `WorkloadIdentityCredential` ou `DefaultAzureCredential`.

### Problemas comuns do SDK

| Problema | Sintoma | Correção |
|---|---|---|
| Versão antiga do SDK | `WorkloadIdentityCredential` não reconhecido | Atualize para a versão mais recente do pacote `azure-identity` |
| `AZURE_CLIENT_SECRET` está definido | `DefaultAzureCredential` usa `ClientSecretCredential` ao invés de `WorkloadIdentityCredential` | Remova a variável de ambiente. WI não precisa de secrets. |
| `ClientSecretCredential` explícito no código | Ignora o Workload Identity completamente | Substitua por `DefaultAzureCredential()` ou `WorkloadIdentityCredential()` |
| Problema de cache de token | Funciona uma vez, falha após o token expirar | Atualize o SDK. Versões antigas tinham bugs de refresh de token. |

### Versões mínimas do SDK

| Linguagem | Pacote | Versão mínima |
|-----------|--------|---------------|
| .NET | `Azure.Identity` | 1.9.0+ |
| Python | `azure-identity` | 1.14.0+ |
| Java | `azure-identity` | 1.10.0+ |
| JavaScript | `@azure/identity` | 3.3.0+ |
| Go | `azidentity` | 1.4.0+ |

---

## Script de diagnóstico completo

Execute isto para verificar todos os pontos de verificação de uma vez:

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

## Recursos

- [Visão geral do Workload Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [Solução de problemas do Workload Identity](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/extensions/troubleshoot-workload-identity)
- [Implantar e configurar Workload Identity](https://learn.microsoft.com/en-us/azure/aks/workload-identity-deploy-cluster)
