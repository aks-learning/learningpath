---
sidebar_position: 1
title: "Armazenamento no AKS"
description: "Storage classes, persistent volumes e provisionamento dinâmico -- o que usar e quando"
---

# Armazenamento no AKS

Use Azure Disks para bancos de dados. Azure Files para armazenamento compartilhado. Blob para grandes conjuntos de dados. Todo o resto é caso especial.

## Storage classes (integradas)

O AKS já vem com estas storage classes pré-configuradas. Não crie as suas a menos que precise de parâmetros personalizados.

| Storage Class | Backend | Modo de Acesso | Caso de Uso |
|---------------|---------|----------------|-------------|
| `managed-csi` | Azure Disks (Premium LRS) | ReadWriteOnce | Bancos de dados, apps stateful com pod único |
| `managed-csi-premium` | Azure Disks (Premium LRS) | ReadWriteOnce | Mesmo que acima, premium explícito |
| `azurefile-csi` | Azure Files (Standard) | ReadWriteMany | Configurações compartilhadas, conteúdo CMS |
| `azurefile-csi-premium` | Azure Files (Premium) | ReadWriteMany | Armazenamento compartilhado que precisa de IOPS |
| `azureblob-nfs` | Blob NFS | ReadWriteMany | Grandes conjuntos de dados, dados de treinamento de ML |

:::tip Opinião

Use `managed-csi` (Azure Disks) como padrão para qualquer coisa stateful. Só recorra ao Azure Files quando múltiplos pods precisarem de acesso simultâneo de leitura/escrita aos mesmos dados.
:::

## Ciclo de vida do PersistentVolume

![Ciclo de Vida do PersistentVolume](/img/pv-lifecycle.svg)

Sempre use provisionamento dinâmico a menos que tenha discos pré-existentes para importar. O provisionamento dinâmico cria o recurso Azure automaticamente quando um PVC é submetido.

## Exemplo de provisionamento dinâmico

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
      storage: 100Gi
```

Só isso. O AKS cria um disco gerenciado Premium SSD, anexa ao node que está rodando seu pod e monta. Nenhuma criação manual de disco necessária.

## Políticas de recuperação (reclaim policies)

| Política | Comportamento ao Deletar PVC | Quando Usar |
|----------|------------------------------|-------------|
| `Delete` | Disco/compartilhamento é destruído | Workloads efêmeros, dev/test, caches |
| `Retain` | Disco/compartilhamento é preservado (órfão) | Bancos de dados em produção, dados que você não pode perder |

:::warning

A política de recuperação padrão para `managed-csi` é `Delete`. Se você deletar o PVC, seu disco e todos os dados serão perdidos. Para bancos de dados em produção, crie uma StorageClass personalizada com `reclaimPolicy: Retain`.
:::

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: managed-csi-retain
provisioner: disk.csi.azure.com
parameters:
  skuName: Premium_LRS
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

## Modos de acesso

| Modo | Significado | Suportado Por |
|------|-------------|---------------|
| ReadWriteOnce (RWO) | Leitura/escrita em node único | Azure Disks |
| ReadOnlyMany (ROX) | Somente leitura em múltiplos nodes | Azure Disks, Azure Files |
| ReadWriteMany (RWX) | Leitura/escrita em múltiplos nodes | Azure Files, Blob NFS |

:::info

Azure Disks são dispositivos de bloco -- eles se conectam fisicamente a um node por vez. Se você precisa que múltiplos pods em nodes diferentes escrevam no mesmo volume, você precisa do Azure Files ou Blob NFS.
:::

## Erros comuns

1. **Usar Azure Files para bancos de dados**-- Azure Files tem latência mais alta que Disks. Use Disks para qualquer coisa sensível a IOPS.
2. **Esquecer `volumeBindingMode: WaitForFirstConsumer`** -- Sem isso, o disco pode ser provisionado em uma zona onde nenhum node consegue montá-lo.
3. **Não configurar `allowVolumeExpansion: true`** -- Você vai precisar redimensionar discos. Habilite isso desde o início.
4. **Usar política de recuperação `Delete` para dados de produção** -- Um `kubectl delete pvc` acidental destrói seu banco de dados.

## Recursos

- [Conceitos de armazenamento no AKS](https://learn.microsoft.com/azure/aks/concepts-storage)
- [Drivers CSI no AKS](https://learn.microsoft.com/azure/aks/csi-storage-drivers)
- [Provisionamento dinâmico de volumes](https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/)
