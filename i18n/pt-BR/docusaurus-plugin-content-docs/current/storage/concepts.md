---
sidebar_position: 1
title: "Armazenamento no AKS"
description: "Storage classes, persistent volumes e provisionamento dinamico -- o que usar e quando"
---

# Armazenamento no AKS

Use Azure Disks para bancos de dados. Azure Files para armazenamento compartilhado. Blob para grandes conjuntos de dados. Todo o resto e caso especial.

## Storage Classes (Integradas)

O AKS ja vem com estas storage classes pre-configuradas. Nao crie as suas a menos que precise de parametros personalizados.

| Storage Class | Backend | Modo de Acesso | Caso de Uso |
|---------------|---------|----------------|-------------|
| `managed-csi` | Azure Disks (Premium LRS) | ReadWriteOnce | Bancos de dados, apps stateful com pod unico |
| `managed-csi-premium` | Azure Disks (Premium LRS) | ReadWriteOnce | Mesmo que acima, premium explicito |
| `azurefile-csi` | Azure Files (Standard) | ReadWriteMany | Configuracoes compartilhadas, conteudo CMS |
| `azurefile-csi-premium` | Azure Files (Premium) | ReadWriteMany | Armazenamento compartilhado que precisa de IOPS |
| `azureblob-nfs` | Blob NFS | ReadWriteMany | Grandes conjuntos de dados, dados de treinamento de ML |

:::tip Opiniao

Use `managed-csi` (Azure Disks) como padrao para qualquer coisa stateful. So recorra ao Azure Files quando multiplos pods precisarem de acesso simultaneo de leitura/escrita aos mesmos dados.
:::

## Ciclo de Vida do PersistentVolume

![Ciclo de Vida do PersistentVolume](/img/pv-lifecycle.svg)

Sempre use provisionamento dinamico a menos que tenha discos pre-existentes para importar. O provisionamento dinamico cria o recurso Azure automaticamente quando um PVC e submetido.

## Exemplo de Provisionamento Dinamico

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

So isso. O AKS cria um disco gerenciado Premium SSD, anexa ao node que esta rodando seu pod e monta. Nenhuma criacao manual de disco necessaria.

## Politicas de Recuperacao (Reclaim Policies)

| Politica | Comportamento ao Deletar PVC | Quando Usar |
|----------|------------------------------|-------------|
| `Delete` | Disco/compartilhamento e destruido | Workloads efemeros, dev/test, caches |
| `Retain` | Disco/compartilhamento e preservado (orfao) | Bancos de dados em producao, dados que voce nao pode perder |

:::warning

A politica de recuperacao padrao para `managed-csi` e `Delete`. Se voce deletar o PVC, seu disco e todos os dados serao perdidos. Para bancos de dados em producao, crie uma StorageClass personalizada com `reclaimPolicy: Retain`.
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

## Modos de Acesso

| Modo | Significado | Suportado Por |
|------|-------------|---------------|
| ReadWriteOnce (RWO) | Leitura/escrita em node unico | Azure Disks |
| ReadOnlyMany (ROX) | Somente leitura em multiplos nodes | Azure Disks, Azure Files |
| ReadWriteMany (RWX) | Leitura/escrita em multiplos nodes | Azure Files, Blob NFS |

:::info

Azure Disks sao dispositivos de bloco -- eles se conectam fisicamente a um node por vez. Se voce precisa que multiplos pods em nodes diferentes escrevam no mesmo volume, voce precisa do Azure Files ou Blob NFS.
:::

## Erros Comuns

1. **Usar Azure Files para bancos de dados** -- Azure Files tem latencia mais alta que Disks. Use Disks para qualquer coisa sensivel a IOPS.
2. **Esquecer `volumeBindingMode: WaitForFirstConsumer`** -- Sem isso, o disco pode ser provisionado em uma zona onde nenhum node consegue monta-lo.
3. **Nao configurar `allowVolumeExpansion: true`** -- Voce vai precisar redimensionar discos. Habilite isso desde o inicio.
4. **Usar politica de recuperacao `Delete` para dados de producao** -- Um `kubectl delete pvc` acidental destroi seu banco de dados.

## Recursos

- [Conceitos de armazenamento no AKS](https://learn.microsoft.com/azure/aks/concepts-storage)
- [Drivers CSI no AKS](https://learn.microsoft.com/azure/aks/csi-storage-drivers)
- [Provisionamento dinamico de volumes](https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/)
