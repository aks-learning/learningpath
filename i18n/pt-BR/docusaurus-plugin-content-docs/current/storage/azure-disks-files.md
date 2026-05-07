---
sidebar_position: 2
title: "Azure Disks e Files"
description: "Armazenamento de bloco vs sistemas de arquivos compartilhados -- escolhendo o backend de armazenamento certo para seus workloads no AKS"
---

# Azure Disks e Files

Azure Disks para bancos de dados e workloads stateful com pod unico. Azure Files para armazenamento compartilhado entre pods. Escolha errado e voce tera ou desempenho ruim ou complexidade desnecessaria.

## Azure Disks

Armazenamento de bloco que se conecta a um unico node. Pense nisso como um disco rigido virtual conectado a uma VM.

**Melhor para:** Bancos de dados (PostgreSQL, MySQL, MongoDB), filas de mensagens, qualquer coisa sensivel a IOPS com acesso de escrita unica.

| Tier | IOPS | Throughput | Caso de Uso |
|------|------|------------|-------------|
| Premium SSD v2 | Ate 80.000 | Ate 1.200 MB/s | Bancos de dados em producao (melhor custo/beneficio) |
| Premium SSD | Ate 20.000 | Ate 900 MB/s | Workloads em producao com padroes previsiveis |
| Standard SSD | Ate 6.000 | Ate 750 MB/s | Apenas ambientes dev/test |
| Ultra Disk | Ate 160.000 | Ate 4.000 MB/s | IOPS extremo (SAP HANA, instancias SQL grandes) |
| Standard HDD | Ate 2.000 | Ate 500 MB/s | Nunca use no AKS |

:::tip Opiniao

Premium SSD v2 para bancos de dados em producao -- oferece IOPS/throughput configuraveis independentes do tamanho do disco, entao voce nao paga a mais por capacidade que nao precisa so para ter mais IOPS. Standard SSD para dev/test. Nunca HDD para nada no AKS.
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

Compartilhamentos de arquivos em rede (SMB ou NFS) acessiveis por multiplos pods simultaneamente.

**Melhor para:** Configuracoes compartilhadas, diretorios de conteudo CMS, aplicacoes legadas que precisam de um sistema de arquivos compartilhado entre instancias.

| Protocolo | Suporte a SO | Desempenho | Caso de Uso |
|-----------|-------------|------------|-------------|
| NFS 4.1 | Apenas Linux | Melhor para arquivos pequenos, menor latencia | Workloads Linux que precisam de armazenamento compartilhado |
| SMB 3.0 | Linux + Windows | Bom para I/O sequencial grande | Containers Windows, cross-platform |

:::warning Erro Comum

Nao use Azure Files para bancos de dados. A latencia de rede de um compartilhamento de arquivos comparada a um disco conectado localmente vai destruir o desempenho do seu banco de dados. Use Azure Disks para qualquer coisa que faca I/O aleatorio frequente.
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

## Matriz de Decisao

| Requisito | Use | Por que |
|-----------|-----|---------|
| Armazenamento de banco de dados | Azure Disks (Premium SSD v2) | Menor latencia, maior IOPS |
| Conteudo compartilhado entre pods | Azure Files (NFS) | Acesso ReadWriteMany |
| Armazenamento para containers Windows | Azure Files (SMB) | Unica opcao RWX para Windows |
| Dados de treinamento de ML (arquivos grandes) | Azure Blob NFS | Mais barato para grandes conjuntos de dados |
| Dados temporarios/cache | emptyDir ou discos efemeros | Nao precisa de persistencia |

## Ajuste de Desempenho

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

O Premium SSD v2 permite que voce defina IOPS e throughput independentemente do tamanho do disco. Um disco de 100Gi pode ter 5000 IOPS em vez de ficar preso ao tier baseado no tamanho. Por isso e a melhor escolha para producao.
:::

## Recursos

- [Driver CSI do Azure Disks](https://learn.microsoft.com/azure/aks/azure-csi-disk-storage-provision)
- [Driver CSI do Azure Files](https://learn.microsoft.com/azure/aks/azure-csi-files-storage-provision)
- [Visao geral do Premium SSD v2](https://learn.microsoft.com/azure/virtual-machines/disks-types#premium-ssd-v2)
