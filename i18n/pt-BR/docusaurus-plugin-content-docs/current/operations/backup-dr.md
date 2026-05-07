---
sidebar_position: 2
title: "Backup e Disaster Recovery"
description: "Guia opinativo sobre estratégias de backup do AKS, padrões de disaster recovery e quando usar o quê."
---

# Backup e disaster recovery

Trate o Kubernetes como gado, não como animal de estimação. Seu repositório Git É seu backup primário para manifests. O AKS Backup existe para o que o Git não consegue capturar: dados de persistent volumes e estado de runtime do cluster.

## A pergunta fundamental

Antes de desenhar sua estratégia de DR, responda isto: seu workload é stateless ou stateful?

| Tipo de Workload | Estratégia de Recuperação | Backup Necessário? |
|---------------|-------------------|----------------|
| Apps stateless (APIs, frontends) | Redeploy via Git + CI/CD | Não. Apenas refaça o deploy. |
| Apps stateful (bancos de dados, filas) | Snapshots de PV + restore | Sim. Inegociável. |
| Misto (app + storage anexado) | Git para manifests, AKS Backup para PVs | Sim, para a camada de PV. |

:::tip Seu repositório Git é seu backup primário

Para aplicações stateless, seu repositório Git mais seu pipeline de CI/CD É seu plano de disaster recovery. Você não precisa do AKS Backup para recuperar um manifest de deployment. Você precisa dele para recuperar os dados de um PersistentVolume.
:::

## AKS backup

AKS Backup é a solução de backup nativado Azure usando Backup Vault e Trusted Access. É gerenciada, integrada e não exige que você rode nenhum agente dentro do seu cluster.

### O que é incluído no backup

- **Recursos Kubernetes**: Deployments, Services, ConfigMaps, Secrets, CRDs
- **Persistent Volumes**: Snapshots CSI de disco (Azure Disk, Azure Files)
- **Recursos de escopo de cluster**: Namespaces, ClusterRoles, StorageClasses

### Habilitando o AKS backup

```bash
# Install the backup extension
az k8s-extension create \
  --name azure-aks-backup \
  --cluster-name myCluster \
  --resource-group myRG \
  --cluster-type managedClusters \
  --extension-type Microsoft.DataProtection.Kubernetes

# Create a backup vault
az dataprotection backup-vault create \
  --vault-name myVault \
  --resource-group myRG \
  --location eastus2 \
  --storage-setting "[{type:GeoRedundant,datastore-type:VaultStore}]"

# Configure backup policy (daily, 30-day retention)
az dataprotection backup-policy create \
  --vault-name myVault \
  --resource-group myRG \
  --name daily-30d \
  --policy @backup-policy.json
```

:::warning Habilite AKS Backup para todos os clusters de produção

O custo é negligível comparado a perder o estado do seu workload. Uma única perda irrecuperável de PV vai custar mais em resposta a incidentes do que um ano de armazenamento de backup.
:::

## Restore cross-region

Use um backup vault geo-redundante para habilitar restore cross-region. Quando sua região primária cair, você pode restaurar workloads em um cluster na região pareada.

Requisitos:
- O backup vault deve ser `GeoRedundant` (não `LocallyRedundant`)
- O cluster de destino deve existir na região secundária
- Políticas de rede e ingress devem estar pré-configuradas no cluster de DR

## AKS backup vs Velero

| Critério | AKS Backup | Velero |
|----------|-----------|--------|
| Gerenciado por | Microsoft | Você |
| Backend de storage | Azure Backup Vault | Compatível com S3 (você gerencia) |
| Snapshots de PV | Integração CSI nativa | Requer plugins |
| Cross-region | Nativo com vault geo-redundante | Configuração manual de replicação |
| Suporte | Chamado de suporte Microsoft | Comunidade / fornecedor |
| Modelo de custo | Por instância protegida | Storage + computação que você gerencia |

:::info Use AKS Backup em vez de Velero para novos deploys

AKS Backup é integrado, gerenciado e não exige que você mantenha um backend compatível com S3 ou se preocupe com compatibilidade de versão do Velero. Se você já tem Velero rodando e funciona, mantenha. Para novos clusters, escolha AKS Backup.
:::

## Padrões de disaster recovery

### Active-passive (recomendado para a maioria das equipes)

Dois clusters em regiões diferentes. O primário lida com todo o tráfego. O secundário está quente (rodando, mas sem tráfego). Failover via Azure Traffic Manager ou troca de DNS do Front Door.

- **RTO**: 5-15 minutos (propagação de DNS)
- **RPO**: Depende da frequência de backup (horário = até 1 hora de perda de dados)
- **Custo**: ~1.5x de um único cluster (secundário roda node pools menores)

### Active-active (apenas para missão crítica)

Dois clusters servindo tráfego simultaneamente via Azure Front Door ou Traffic Manager. Não precisa de failover porque ambos estão sempre ativos.

- **RTO**: Quase zero (tráfego redireciona automaticamente)
- **RPO**: Quase zero (ambos os clusters têm estado atual)
- **Custo**: 2x de um único cluster
- **Complexidade**: Alta. Requer apps stateless ou camada de dados distribuída.

### Recuperação baseada em GitOps

Para workloads totalmente stateless: delete o cluster com problema, crie um novo, aponte o Flux/ArgoCD para seu repositório Git e deixe-o reconciliar. Sem necessidade de backup.

```bash
# Disaster strikes. Recovery:
az aks create --resource-group dr-rg --name recovery-cluster ...
flux bootstrap github --owner=myorg --repository=k8s-manifests --path=clusters/prod
```

## Decisões de escopo de backup

Nem tudo precisa ser incluído no backup. Seja deliberado sobre o que você protege.

| Recurso | Fazer Backup? | Justificativa |
|----------|----------|-----------|
| Deployments, Services | Não | Já estão no Git. Refaça deploy da fonte de verdade. |
| ConfigMaps, Secrets | Talvez | Apenas se não gerenciados por GitOps ou external secret store |
| PersistentVolumes | Sim | Dados não armazenados em outro lugar |
| CRDs e CRs | Sim | Estado do operador pode não estar no Git |
| Namespaces | Não | Recriados durante o deploy |
| RBAC (Roles, Bindings) | Talvez | Apenas se gerenciados manualmente, não via GitOps |

:::tip Faça backup do que não pode ser recriado

A regra é simples: se existe apenas dentro do cluster e em nenhum outro lugar, faça backup. Se pode ser reconstruído a partir do Git, CI/CD ou um sistema externo, não desperdice storage de backup com isso.
:::

## Testando seu plano de DR

Um backup que você nunca restaurou não é um backup. Agende exercícios trimestrais de DR.

```bash
# Restore to a test cluster (not production!)
az dataprotection backup-instance restore trigger \
  --vault-name myVault \
  --resource-group myRG \
  --backup-instance-name myCluster-backup \
  --restore-request @restore-config.json
```

Valide após o restore:
1. Todos os namespaces esperados existem
2. PVs estão anexados e contêm os dados esperados
3. Services estão acessíveis e respondendo
4. CRDs e custom resources estão intactos

## Erros comuns

1. **Fazer backup apenas de manifests**-- Seus manifests já estão no Git. Faça backup do que o Git não armazena: dados de PV.
2. **Nunca testar o restore** -- Um backup que você nunca restaurou não é um backup. Teste trimestralmente.
3. **Vault LocallyRedundant para produção** -- Se a região falhar, seus backups falham junto.
4. **Sem runbook de DR** -- Quando o incidente acontece às 3 da manhã, você precisa de instruções passo a passo, não de uma página wiki.
5. **Assumir que PVs sobrevivem à exclusão do cluster** -- Não sobrevivem. Se você deletar o cluster, discos anexados são deletados também, a menos que você tenha snapshots.
6. **Fazer backup de tudo** -- Desperdiça storage e torna o restore mais lento. Seja seletivo.

## Recursos

- [Azure Backup for AKS Overview](https://learn.microsoft.com/en-us/azure/backup/azure-kubernetes-service-backup-overview)
- [AKS Backup Configuration](https://learn.microsoft.com/en-us/azure/backup/azure-kubernetes-service-cluster-backup)
- [HA and DR for AKS](https://learn.microsoft.com/en-us/azure/aks/ha-dr-overview)
- [Cross-Region Restore](https://learn.microsoft.com/en-us/azure/backup/azure-kubernetes-service-cluster-backup-concept)
