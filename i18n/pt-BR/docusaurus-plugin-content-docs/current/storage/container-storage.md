---
sidebar_position: 3
title: "Azure Container Storage"
description: "Armazenamento pooled nativo do Kubernetes com replicacao, NVMe efemero e thin provisioning"
---

# Azure Container Storage

Use o Azure Container Storage para workloads stateful que precisam de armazenamento pooled, replicacao de volumes ou volumes locais efemeros de alto desempenho. Para PVCs simples de disco unico, fique com os drivers CSI regulares.

## O que e

O Azure Container Storage e uma camada de gerenciamento de armazenamento nativa do Kubernetes. Em vez de um PVC mapeando para um Azure Disk, ele cria storage pools que podem ser divididos em volumes com recursos avancados: replicacao entre nodes, thin provisioning, snapshots e volumes NVMe locais efemeros.

:::info

Pense nisso como uma camada de armazenamento definida por software sobre a infraestrutura do Azure. Ele fica entre seus PVCs e o backend de armazenamento subjacente (Azure Disks, NVMe Efemero ou Elastic SAN).
:::

## Backends de Armazenamento

| Backend | Persistencia | Desempenho | Caso de Uso |
|---------|-------------|------------|-------------|
| Azure Disks | Persistente, sobrevive a falha do node | Bom (conectado via rede) | Apps stateful que precisam de replicacao |
| Efemero (NVMe Local) | Perdido ao reiniciar o node | Extremamente rapido (I/O local) | Caches, dados temporarios, espaco de rascunho |
| Azure Elastic SAN | Persistente, compartilhado | IOPS alto em escala | Implantacoes stateful em larga escala |

:::tip Opiniao

Use o Azure Container Storage para dois cenarios: (1) volumes NVMe locais efemeros para caches e dados temporarios que precisam de velocidade bruta, ou (2) armazenamento persistente pooled onde voce precisa de replicacao entre zonas de disponibilidade. Para todo o resto, os drivers CSI padrao sao mais simples.
:::

## Discos Efemeros (NVMe Local)

Discos NVMe locais no node. Incrivelmente rapidos. Sem salto de rede. Sem garantias de persistencia.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: acstor-ephemeraldisk-nvme
provisioner: containerstorage.csi.azure.com
parameters:
  storagePool: ephemeraldisk-nvme
volumeBindingMode: WaitForFirstConsumer
reclaimPolicy: Delete
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-cache
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: acstor-ephemeraldisk-nvme
  resources:
    requests:
      storage: 50Gi
```

**Perfeito para:** Caches Redis, armazenamento temporario do Elasticsearch, caches de modelos de ML, espaco de rascunho para artefatos de build.

:::warning

Dados em NVMe efemero sao perdidos quando o node reinicia, e reimageado ou seu pod e movido para outro node. Use apenas para dados que voce pode reconstruir. Nunca para bancos de dados.
:::

## Pools Persistentes (Backend Azure Disks)

```yaml
apiVersion: containerstorage.azure.com/v1
kind: StoragePool
metadata:
  name: azuredisk-pool
  namespace: acstor
spec:
  poolType:
    azureDisk:
      skuName: Premium_LRS
  resources:
    requests:
      storage: 1Ti
```

Volumes criados a partir deste pool recebem replicacao e thin provisioning automaticamente. O pool pre-provisiona capacidade para que novos PVCs sejam vinculados instantaneamente em vez de esperar pela criacao do disco.

## Quando Usar Container Storage vs Drivers CSI

| Requisito | Use Container Storage | Use Drivers CSI |
|-----------|----------------------|-----------------|
| PVC simples de disco unico | Nao | Sim -- mais simples, menos partes moveis |
| Volumes NVMe locais efemeros | Sim | N/A -- drivers CSI nao suportam isso |
| Replicacao de volume entre nodes | Sim | Nao -- nao suportado |
| Thin provisioning (overcommit) | Sim | Nao |
| Gerenciamento de armazenamento pooled | Sim | Nao |
| Banco de dados em producao (escritor unico) | Ambos funcionam | Mais simples com CSI |
| I/O local mais rapido possivel | Sim (NVMe) | Nao |

## Habilitando o Azure Container Storage

```bash
# Habilitar em cluster existente
az aks update \
  --resource-group myrg \
  --name myaks \
  --enable-azure-container-storage ephemeralDisk

# Ou com backend Azure Disks
az aks update \
  --resource-group myrg \
  --name myaks \
  --enable-azure-container-storage azureDisk
```

:::info

O Azure Container Storage requer SKUs de VM especificas que tenham discos NVMe locais (para efemero) ou capacidade suficiente. VMs das series L e Lsv2 possuem NVMe local. Series D/E padrao funcionam com o backend Azure Disks.
:::

## Erros Comuns

1. **Usar NVMe efemero para dados persistentes** -- Seus dados serao perdidos. Isso e por design.
2. **Habilitar Container Storage quando voce so precisa de um PVC simples** -- Adiciona complexidade operacional sem beneficio.
3. **Nao verificar compatibilidade do SKU da VM** -- NVMe efemero requer VMs com drives NVMe locais.

## Recursos

- [Visao geral do Azure Container Storage](https://learn.microsoft.com/azure/storage/container-storage/container-storage-introduction)
- [Habilitar Azure Container Storage](https://learn.microsoft.com/azure/aks/container-storage-enable)
- [Storage pools com disco efemero](https://learn.microsoft.com/azure/storage/container-storage/use-container-storage-with-local-disk)
