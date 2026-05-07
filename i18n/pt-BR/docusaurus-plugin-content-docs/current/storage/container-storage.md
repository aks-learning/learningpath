---
sidebar_position: 3
title: "Azure Container Storage"
description: "Armazenamento pooled nativo do Kubernetes com replicação, NVMe efêmero e thin provisioning"
---

# Azure Container Storage

Use o Azure Container Storage para workloads stateful que precisam de armazenamento pooled, replicação de volumes ou volumes locais efêmeros de alto desempenho. Para PVCs simples de disco único, fique com os drivers CSI regulares.

## O que é

O Azure Container Storage é uma camada de gerenciamento de armazenamento nativa do Kubernetes. Em vez de um PVC mapeando para um Azure Disk, ele cria storage pools que podem ser divididos em volumes com recursos avançados: replicação entre nodes, thin provisioning, snapshots e volumes NVMe locais efêmeros.

:::info

Pense nisso como uma camada de armazenamento definida por software sobre a infraestrutura do Azure. Ele fica entre seus PVCs e o backend de armazenamento subjacente (Azure Disks, NVMe Efêmero ou Elastic SAN).
:::

## Backends de armazenamento

| Backend | Persistência | Desempenho | Caso de Uso |
|---------|-------------|------------|-------------|
| Azure Disks | Persistente, sobrevive a falha do node | Bom (conectado via rede) | Apps stateful que precisam de replicação |
| Efêmero (NVMe Local) | Perdido ao reiniciar o node | Extremamente rápido (I/O local) | Caches, dados temporários, espaço de rascunho |
| Azure Elastic SAN | Persistente, compartilhado | IOPS alto em escala | Implantações stateful em larga escala |

:::tip Opinião

Use o Azure Container Storage para dois cenários: (1) volumes NVMe locais efêmeros para caches e dados temporários que precisam de velocidade bruta, ou (2) armazenamento persistente pooled onde você precisa de replicação entre zonas de disponibilidade. Para todo o resto, os drivers CSI padrão são mais simples.
:::

## Discos efêmeros (NVMe local)

Discos NVMe locais no node. Incrivelmente rápidos. Sem salto de rede. Sem garantias de persistência.

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

**Perfeito para:** Caches Redis, armazenamento temporário do Elasticsearch, caches de modelos de ML, espaço de rascunho para artefatos de build.

:::warning

Dados em NVMe efêmero são perdidos quando o node reinicia, é reimageado ou seu pod é movido para outro node. Use apenas para dados que você pode reconstruir. Nunca para bancos de dados.
:::

## Pools persistentes (backend Azure Disks)

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

Volumes criados a partir deste pool recebem replicação e thin provisioning automaticamente. O pool pré-provisiona capacidade para que novos PVCs sejam vinculados instantaneamente em vez de esperar pela criação do disco.

## Quando usar Container Storage vs drivers CSI

| Requisito | Use Container Storage | Use Drivers CSI |
|-----------|----------------------|-----------------|
| PVC simples de disco único | Não | Sim -- mais simples, menos partes móveis |
| Volumes NVMe locais efêmeros | Sim | N/A -- drivers CSI não suportam isso |
| Replicação de volume entre nodes | Sim | Não -- não suportado |
| Thin provisioning (overcommit) | Sim | Não |
| Gerenciamento de armazenamento pooled | Sim | Não |
| Banco de dados em produção (escritor único) | Ambos funcionam | Mais simples com CSI |
| I/O local mais rápido possível | Sim (NVMe) | Não |

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

O Azure Container Storage requer SKUs de VM específicas que tenham discos NVMe locais (para efêmero) ou capacidade suficiente. VMs das séries L e Lsv2 possuem NVMe local. Séries D/E padrão funcionam com o backend Azure Disks.
:::

## Erros comuns

1. **Usar NVMe efêmero para dados persistentes**-- Seus dados serão perdidos. Isso é por design.
2. **Habilitar Container Storage quando você só precisa de um PVC simples** -- Adiciona complexidade operacional sem benefício.
3. **Não verificar compatibilidade do SKU da VM** -- NVMe efêmero requer VMs com drives NVMe locais.

## Recursos

- [Visão geral do Azure Container Storage](https://learn.microsoft.com/azure/storage/container-storage/container-storage-introduction)
- [Habilitar Azure Container Storage](https://learn.microsoft.com/azure/aks/container-storage-enable)
- [Storage pools com disco efêmero](https://learn.microsoft.com/azure/storage/container-storage/use-container-storage-with-local-disk)
