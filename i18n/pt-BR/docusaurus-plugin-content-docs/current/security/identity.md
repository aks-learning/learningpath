---
sidebar_position: 1
title: "Gerenciamento de Identidade e Acesso"
description: "Integrações com Entra ID, Azure RBAC para Kubernetes e estratégia de managed identity para clusters AKS."
---

# Gerenciamento de identidade e acesso

A integração com o Entra ID é A forma de gerenciar acesso ao AKS. Não existe debate aqui. Se você está usando contas locais ou autenticação baseada em certificado em produção, você está fazendo errado e criando um pesadelo de auditoria.

## A regra

Nunca use contas locais do Kubernetes. Desabilite-as. Use Entra ID combinado com Kubernetes RBAC para todo cluster, todo ambiente, sem exceções.

:::warning

Contas locais não podem ser auditadas pelo Entra ID, não conseguem impor MFA e não podem ser revogadas centralmente. Um kubeconfig comprometido com credenciais de admin local dá acesso permanente ao cluster até você rotacionar os certificados.
:::

## Crie um cluster do jeito certo

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

Cada flag importa. `--enable-aad` ativa a integração com o Entra ID. `--enable-azure-rbac` mapeia roles do Azure diretamente para o Kubernetes RBAC, permitindo que você gerencie tudo a partir de um único control plane. `--disable-local-accounts` elimina a porta dos fundos.

## Azure RBAC para Kubernetes: a decisão

| Abordagem | Quando Usar | Veredito |
|-----------|-------------|----------|
| Azure RBAC para K8s | Produção, enterprise | Use isto. Control plane único para permissões Azure e K8s |
| Kubernetes RBAC apenas | Nunca em produção | Força RoleBindings separados, sem trilha de auditoria do Entra ID |
| Azure RBAC + K8s RBAC | Multi-tenant complexo | Aceitável se Azure RBAC sozinho for muito grosseiro |

Com Azure RBAC para Kubernetes, você atribui roles como `Azure Kubernetes Service RBAC Reader` ou `Azure Kubernetes Service RBAC Writer` em níveis de escopo (cluster, namespace). Nenhum RoleBinding separado é necessário.

```bash
# Give a team namespace-scoped write access
az role assignment create \
  --role "Azure Kubernetes Service RBAC Writer" \
  --assignee "<entra-group-id>" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/<cluster>/namespaces/team-a"
```

## Managed identity para o cluster

O próprio cluster precisa de uma identidade para gerenciar recursos do Azure (load balancers, discos, rede). Você tem duas opções:

| Tipo de Identidade | Vantagens | Desvantagens | Recomendação |
|--------------------|-----------|--------------|--------------|
| System-assigned | Zero configuração, criada automaticamente | Morre com o cluster, não permite pré-atribuir permissões | Apenas dev/test |
| User-assigned | Sobrevive a recriação, reutilizável, pré-configurável | Um pouco mais de setup | Sempre em produção |

:::tip

Use user-assigned managed identity para clusters de produção. Quando você recriar um cluster (e você vai -- upgrades, testes de DR, reprovisionamento via IaC), a identidade persiste com todas as suas atribuições de role intactas. System-assigned identity significa refazer cada atribuição de RBAC do zero.
:::

## Acesso de emergência (break-glass)

Você desabilitou contas locais (bom). Mas você precisa de um caminho de emergência para quando o Entra ID tiver problemas.

1. Crie um grupo de segurança dedicado no Entra ID chamado `aks-emergency-admins`
2. Adicione apenas 2-3 engenheiros de plataforma seniors
3. Atribua a role `Azure Kubernetes Service Cluster Admin` a este grupo
4. Monitore mudanças de membros com access reviews do Entra ID
5. Documente o procedimento de break-glass no seu runbook

```bash
# Re-enable local accounts in true emergency only
az aks update --resource-group myRG --name myCluster --enable-local-accounts
# Get credentials
az aks get-credentials --resource-group myRG --name myCluster --admin
# Fix the issue, then disable again
az aks update --resource-group myRG --name myCluster --disable-local-accounts
```

## Conditional access: exija MFA para acesso ao cluster

Políticas de Conditional Access do Entra ID se aplicam a autenticação do AKS. Isso significa que você pode exigir MFA, dispositivos em conformidade ou restringir o acesso a locais de rede específicos para qualquer pessoa executando kubectl.

Configure uma política de Conditional Access direcionada ao aplicativo "Azure Kubernetes Service AAD Server" no seu tenant do Entra ID. Exija MFA e um dispositivo em conformidade para todos os usuários, exceto o grupo de admin de emergência.

:::info

Conditional Access se aplica no momento da aquisição do token. Uma vez que o usuário tenha um token válido (tipicamente 1 hora), ele pode acessar o cluster sem reautenticação até o token expirar. Planeje o tempo de vida do token de acordo.
:::

## Roles Azure RBAC disponíveis para Kubernetes

| Role | Escopo | O Que Concede |
|------|--------|---------------|
| Azure Kubernetes Service Cluster Admin | Cluster | Admin completo, equivalente ao ClusterRole cluster-admin |
| Azure Kubernetes Service RBAC Admin | Cluster/Namespace | Gerencia todos os recursos incluindo RBAC bindings |
| Azure Kubernetes Service RBAC Writer | Cluster/Namespace | Leitura/escrita na maioria dos recursos, sem gerenciamento de RBAC |
| Azure Kubernetes Service RBAC Reader | Cluster/Namespace | Acesso somente leitura na maioria dos recursos |

Comece com Reader para todos os desenvolvedores. Promova para Writer apenas nos namespaces que eles possuem. Admin e Cluster Admin devem ser reservados apenas para times de plataforma.

## Erros comuns

1. **Deixar contas locais habilitadas "por precaução"** -- Isso é uma porta dos fundos. Desabilite-as e use o procedimento de break-glass.
2. **Usar system-assigned MI em produção** -- Você perderá todas as atribuições de role quando o cluster for recriado.
3. **Não definir RBAC por namespace** -- Dar acesso de writer no cluster inteiro quando os times precisam apenas de acesso ao namespace viola o princípio de menor privilégio.
4. **Pular grupos do Entra ID** -- Atribuir roles a usuários individuais em vez de grupos cria uma proliferação impossível de manter.
5. **Esquecer do Conditional Access** -- O Entra ID suporta exigir MFA, dispositivos em conformidade ou locais específicos para acesso ao cluster. Use.
6. **Não revisar acessos regularmente** -- Use access reviews do Entra ID para validar periodicamente se as associações a grupos ainda são apropriadas. Pessoas mudam de time; permissões devem acompanhar.

## Recursos

- [Entra ID Integration with AKS](https://learn.microsoft.com/en-us/azure/aks/azure-ad-integration-cli)
- [Azure RBAC for Kubernetes Authorization](https://learn.microsoft.com/en-us/azure/aks/manage-azure-rbac)
- [Disable Local Accounts](https://learn.microsoft.com/en-us/azure/aks/managed-aad#disable-local-accounts)
- [AKS Managed Identity](https://learn.microsoft.com/en-us/azure/aks/use-managed-identity)
