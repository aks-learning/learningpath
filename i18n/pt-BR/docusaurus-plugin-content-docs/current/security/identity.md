---
sidebar_position: 1
title: "Gerenciamento de Identidade e Acesso"
description: "Integracoes com Entra ID, Azure RBAC para Kubernetes e estrategia de managed identity para clusters AKS."
---

# Gerenciamento de Identidade e Acesso

A integracao com o Entra ID e A forma de gerenciar acesso ao AKS. Nao existe debate aqui. Se voce esta usando contas locais ou autenticacao baseada em certificado em producao, voce esta fazendo errado e criando um pesadelo de auditoria.

## A Regra

Nunca use contas locais do Kubernetes. Desabilite-as. Use Entra ID combinado com Kubernetes RBAC para todo cluster, todo ambiente, sem excecoes.

:::warning

Contas locais nao podem ser auditadas pelo Entra ID, nao conseguem impor MFA e nao podem ser revogadas centralmente. Um kubeconfig comprometido com credenciais de admin local da acesso permanente ao cluster ate voce rotacionar os certificados.
:::

## Crie um Cluster do Jeito Certo

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

Cada flag importa. `--enable-aad` ativa a integracao com o Entra ID. `--enable-azure-rbac` mapeia roles do Azure diretamente para o Kubernetes RBAC, permitindo que voce gerencie tudo a partir de um unico control plane. `--disable-local-accounts` elimina a porta dos fundos.

## Azure RBAC para Kubernetes: A Decisao

| Abordagem | Quando Usar | Veredito |
|-----------|-------------|----------|
| Azure RBAC para K8s | Producao, enterprise | Use isto. Control plane unico para permissoes Azure e K8s |
| Kubernetes RBAC apenas | Nunca em producao | Forca RoleBindings separados, sem trilha de auditoria do Entra ID |
| Azure RBAC + K8s RBAC | Multi-tenant complexo | Aceitavel se Azure RBAC sozinho for muito grosseiro |

Com Azure RBAC para Kubernetes, voce atribui roles como `Azure Kubernetes Service RBAC Reader` ou `Azure Kubernetes Service RBAC Writer` em niveis de escopo (cluster, namespace). Nenhum RoleBinding separado e necessario.

```bash
# Give a team namespace-scoped write access
az role assignment create \
  --role "Azure Kubernetes Service RBAC Writer" \
  --assignee "<entra-group-id>" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/<cluster>/namespaces/team-a"
```

## Managed Identity para o Cluster

O proprio cluster precisa de uma identidade para gerenciar recursos do Azure (load balancers, discos, rede). Voce tem duas opcoes:

| Tipo de Identidade | Vantagens | Desvantagens | Recomendacao |
|--------------------|-----------|--------------|--------------|
| System-assigned | Zero configuracao, criada automaticamente | Morre com o cluster, nao permite pre-atribuir permissoes | Apenas dev/test |
| User-assigned | Sobrevive a recriacao, reutilizavel, pre-configuravel | Um pouco mais de setup | Sempre em producao |

:::tip

Use user-assigned managed identity para clusters de producao. Quando voce recriar um cluster (e voce vai -- upgrades, testes de DR, reprovisionamento via IaC), a identidade persiste com todas as suas atribuicoes de role intactas. System-assigned identity significa refazer cada atribuicao de RBAC do zero.
:::

## Acesso de Emergencia (Break-Glass)

Voce desabilitou contas locais (bom). Mas voce precisa de um caminho de emergencia para quando o Entra ID tiver problemas.

1. Crie um grupo de seguranca dedicado no Entra ID chamado `aks-emergency-admins`
2. Adicione apenas 2-3 engenheiros de plataforma seniors
3. Atribua a role `Azure Kubernetes Service Cluster Admin` a este grupo
4. Monitore mudancas de membros com access reviews do Entra ID
5. Documente o procedimento de break-glass no seu runbook

```bash
# Re-enable local accounts in true emergency only
az aks update --resource-group myRG --name myCluster --enable-local-accounts
# Get credentials
az aks get-credentials --resource-group myRG --name myCluster --admin
# Fix the issue, then disable again
az aks update --resource-group myRG --name myCluster --disable-local-accounts
```

## Conditional Access: Exija MFA para Acesso ao Cluster

Politicas de Conditional Access do Entra ID se aplicam a autenticacao do AKS. Isso significa que voce pode exigir MFA, dispositivos em conformidade ou restringir o acesso a locais de rede especificos para qualquer pessoa executando kubectl.

Configure uma politica de Conditional Access direcionada ao aplicativo "Azure Kubernetes Service AAD Server" no seu tenant do Entra ID. Exija MFA e um dispositivo em conformidade para todos os usuarios, exceto o grupo de admin de emergencia.

:::info

Conditional Access se aplica no momento da aquisicao do token. Uma vez que o usuario tenha um token valido (tipicamente 1 hora), ele pode acessar o cluster sem reautenticacao ate o token expirar. Planeje o tempo de vida do token de acordo.
:::

## Roles Azure RBAC Disponiveis para Kubernetes

| Role | Escopo | O Que Concede |
|------|--------|---------------|
| Azure Kubernetes Service Cluster Admin | Cluster | Admin completo, equivalente ao ClusterRole cluster-admin |
| Azure Kubernetes Service RBAC Admin | Cluster/Namespace | Gerencia todos os recursos incluindo RBAC bindings |
| Azure Kubernetes Service RBAC Writer | Cluster/Namespace | Leitura/escrita na maioria dos recursos, sem gerenciamento de RBAC |
| Azure Kubernetes Service RBAC Reader | Cluster/Namespace | Acesso somente leitura na maioria dos recursos |

Comece com Reader para todos os desenvolvedores. Promova para Writer apenas nos namespaces que eles possuem. Admin e Cluster Admin devem ser reservados apenas para times de plataforma.

## Erros Comuns

1. **Deixar contas locais habilitadas "por precaucao"** -- Isso e uma porta dos fundos. Desabilite-as e use o procedimento de break-glass.
2. **Usar system-assigned MI em producao** -- Voce perdera todas as atribuicoes de role quando o cluster for recriado.
3. **Nao definir RBAC por namespace** -- Dar acesso de writer no cluster inteiro quando os times precisam apenas de acesso ao namespace viola o principio de menor privilegio.
4. **Pular grupos do Entra ID** -- Atribuir roles a usuarios individuais em vez de grupos cria uma proliferacao impossivel de manter.
5. **Esquecer do Conditional Access** -- O Entra ID suporta exigir MFA, dispositivos em conformidade ou locais especificos para acesso ao cluster. Use.
6. **Nao revisar acessos regularmente** -- Use access reviews do Entra ID para validar periodicamente se as associacoes a grupos ainda sao apropriadas. Pessoas mudam de time; permissoes devem acompanhar.

## Recursos

- [Entra ID Integration with AKS](https://learn.microsoft.com/en-us/azure/aks/azure-ad-integration-cli)
- [Azure RBAC for Kubernetes Authorization](https://learn.microsoft.com/en-us/azure/aks/manage-azure-rbac)
- [Disable Local Accounts](https://learn.microsoft.com/en-us/azure/aks/managed-aad#disable-local-accounts)
- [AKS Managed Identity](https://learn.microsoft.com/en-us/azure/aks/use-managed-identity)
