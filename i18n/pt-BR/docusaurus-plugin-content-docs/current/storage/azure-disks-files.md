---
sidebar_position: 2
title: "Azure Disks e Files"
description: "Armazenamento de bloco vs sistemas de arquivos compartilhados -- escolhendo o backend de armazenamento certo para seus workloads no AKS"
---

# Azure Disks e Files

Azure Disks para bancos de dados e workloads stateful com pod único. Azure Files para armazenamento compartilhado entre pods. Escolha errado e você terá ou desempenho ruim ou complexidade desnecessária.

## Azure Disks

Armazenamento de bloco que se conecta a um único node. Pense nisso como um disco rígido virtual conectado a uma VM.

**Melhor para:** Bancos de dados (PostgreSQL, MySQL, MongoDB), filas de mensagens, qualquer coisa sensível a IOPS com acesso de escrita única.

| Tier | IOPS | Throughput | Caso de Uso |
|------|------|------------|-------------|
| Premium SSD v2 | Até 80.000 | Até 1.200 MB/s | Bancos de dados em produção (melhor custo/benefício) |
| Premium SSD | Até 20.000 | Até 900 MB/s | Workloads em produção com padrões previsíveis |
| Standard SSD | Até 6.000 | Até 750 MB/s | Apenas ambientes dev/test |
| Ultra Disk | Até 160.000 | Até 4.000 MB/s | IOPS extremo (SAP HANA, instâncias SQL grandes) |
| Standard HDD | Até 2.000 | Até 500 MB/s | Nunca use no AKS |

:::tip Opinião

Premium SSD v2 para bancos de dados em produção -- oferece IOPS/throughput configuráveis independentes do tamanho do disco, então você não paga a mais por capacidade que não precisa só para ter mais IOPS. Standard SSD para dev/test. Nunca HDD para nada no AKS.
:::

### Exemplo de PVC: Azure Disk

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: managed-csi
  resources:
    requests:
      storage: 256Gi
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  template:
    spec:
      containers:
        - name: postgres
          volumeMounts:
            - mountPath: /var/lib/postgresql/data
              name: data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: postgres-data
```

## Azure Files

Compartilhamentos de arquivos em rede (SMB ou NFS) acessíveis por múltiplos pods simultaneamente.

**Melhor para:** Configurações compartilhadas, diretórios de conteúdo CMS, aplicações legadas que precisam de um sistema de arquivos compartilhado entre instâncias.

| Protocolo | Suporte a SO | Desempenho | Caso de Uso |
|-----------|-------------|------------|-------------|
| NFS 4.1 | Apenas Linux | Melhor para arquivos pequenos, menor latência | Workloads Linux que precisam de armazenamento compartilhado |
| SMB 3.0 | Linux + Windows | Bom para I/O sequencial grande | Containers Windows, cross-platform |

:::warning Erro Comum

Não use Azure Files para bancos de dados. A latência de rede de um compartilhamento de arquivos comparada a um disco conectado localmente vai destruir o desempenho do seu banco de dados. Use Azure Disks para qualquer coisa que faça I/O aleatório frequente.
:::

### Exemplo de PVC: Azure Files (NFS)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-content
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: azurefile-csi-premium
  resources:
    requests:
      storage: 100Gi
```

## Matriz de decisão

| Requisito | Use | Por que |
|-----------|-----|---------|
| Armazenamento de banco de dados | Azure Disks (Premium SSD v2) | Menor latência, maior IOPS |
| Conteúdo compartilhado entre pods | Azure Files (NFS) | Acesso ReadWriteMany |
| Armazenamento para containers Windows | Azure Files (SMB) | Única opção RWX para Windows |
| Dados de treinamento de ML (arquivos grandes) | Azure Blob NFS | Mais barato para grandes conjuntos de dados |
| Dados temporários/cache | emptyDir ou discos efêmeros | Não precisa de persistência |

## Ajuste de desempenho

```yaml
# StorageClass personalizada para Premium SSD v2 com IOPS especificos
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: premiumv2-custom
provisioner: disk.csi.azure.com
parameters:
  skuName: PremiumV2_LRS
  DiskIOPSReadWrite: "5000"
  DiskMBpsReadWrite: "200"
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

:::info

O Premium SSD v2 permite que você defina IOPS e throughput independentemente do tamanho do disco. Um disco de 100Gi pode ter 5000 IOPS em vez de ficar preso ao tier baseado no tamanho. Por isso é a melhor escolha para produção.
:::

## Recursos

- [Driver CSI do Azure Disks](https://learn.microsoft.com/azure/aks/azure-csi-disk-storage-provision)
- [Driver CSI do Azure Files](https://learn.microsoft.com/azure/aks/azure-csi-files-storage-provision)
- [Visão geral do Premium SSD v2](https://learn.microsoft.com/azure/virtual-machines/disks-types#premium-ssd-v2)
