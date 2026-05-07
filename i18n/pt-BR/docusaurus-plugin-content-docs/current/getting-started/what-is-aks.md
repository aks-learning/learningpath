---
sidebar_position: 2
title: "O que e AKS?"
description: "Azure Kubernetes Service e o melhor Kubernetes gerenciado no Azure. Control plane gratuito, nativo com Entra ID e rede Azure integrada."
---

# O que e AKS?

Azure Kubernetes Service (AKS) e a plataforma de Kubernetes gerenciado da Microsoft. Ele roda seus workloads containerizados no Azure com um **control plane gratuito e gerenciado pela Microsoft** e worker nodes que ficam na sua subscription.

**AKS e a melhor opcao de Kubernetes gerenciado no Azure. Ponto final.** Nao considere K8s auto-gerenciado em VMs. Nao considere distribuicoes de K8s de terceiros no Azure. AKS te da a API completa do Kubernetes com integracoes nativas do Azure que nenhuma outra opcao pode igualar.

## Arquitetura: O que a Microsoft Gerencia vs. O que Voce Administra

![Arquitetura AKS](/img/aks-architecture.svg)

A divisao e clara:

| Componente | Quem Gerencia | O que Isso Significa |
|------------|--------------|----------------------|
| **API Server** | Microsoft | Sempre disponivel (SLA de 99.95% no tier Standard). Voce nunca aplica patches. |
| **etcd** | Microsoft | Backup feito, replicado, criptografado em repouso. Voce nunca toca nisso. |
| **Scheduler + Controller Manager** | Microsoft | Upgrades acontecem automaticamente do lado deles. |
| **Worker Nodes (Node Pools)** | Voce | VMs na sua subscription. Voce escolhe o SKU, quantidade e regras de escalabilidade. |
| **Pods e Workloads** | Voce | Seus containers, sua responsabilidade. |
| **Rede (VNet, LB, DNS)** | Compartilhado | AKS provisiona recursos Azure na sua subscription. Voce configura a topologia. |

:::info Ponto-chave

Voce paga zero pelo control plane. Seu custo e apenas as VMs dos worker nodes, armazenamento e rede na sua subscription. Isso torna o AKS o ponto de entrada mais barato para Kubernetes em producao em qualquer cloud.
:::

## Por que AKS em Vez de Outros Kubernetes Gerenciados

| Diferencial | Por que Importa |
|-------------|-----------------|
| **Integracao com Entra ID** | Sem provedor de identidade separado para gerenciar. Seus desenvolvedores autenticam com credenciais corporativas. Workload Identity da aos Pods identidade cloud-native sem gerenciar secrets. |
| **Rede nativa do Azure** | Seu cluster vive dentro de uma Azure VNet. Clusters privados, network policies, integracao com Azure Firewall -- tudo de primeira classe. Sem gambiarras de overlay. |
| **Upgrades gerenciados** | Escolha entre canais Stable, Rapid ou Node Image. Ou totalmente automatico. Sem mais situacoes de "estamos 4 versoes minor atrasados". |
| **Azure Monitor + Prometheus + Grafana** | Stack de observabilidade com um clique. Prometheus gerenciado para metricas, Grafana gerenciado para dashboards, Container Insights para logs. |
| **Defender for Containers** | Deteccao de ameacas em runtime, varredura de vulnerabilidades, admission control -- integrado, nao remendado. |
| **KEDA integrado** | Autoscaling orientado a eventos sem instalar e manter o operador do KEDA voce mesmo. |
| **Pronto para IA/ML** | GPU node pools, KAITO para inferencia de modelos, AI Toolchain Operator para pipelines de treinamento. |

## Tiers de Preco: Escolha o Certo

:::warning Nao rode producao no tier Free

O tier Free nao tem SLA, nenhuma garantia de uptime e recursos limitados do API server. Ele existe apenas para aprendizado e dev/test. Rodar producao no tier Free e pedir por uma indisponibilidade no pior momento possivel.
:::

| Tier | Custo Mensal | SLA | Caso de Uso | Recomendacao |
|------|-------------|-----|-------------|--------------|
| **Free** | $0 | Nenhum | Dev/test, aprendizado, experimentacao | Use apenas para labs e sandboxes |
| **Standard** | ~$73/mes por cluster | 99.95% (com AZs) | Workloads de producao | **Este e seu padrao para producao.** |
| **Premium** | ~$146/mes por cluster | 99.95% | Missao critica, suporte de longo prazo | Use quando precisar de versoes LTS ou recursos avancados |

O custo do tier e APENAS para as capacidades do control plane. Voce ainda paga pelas VMs dos seus nodes separadamente.

## Critico: Migracao de SO dos Nodes Necessaria

:::warning Descontinuacao do Azure Linux 2.0 -- Novembro de 2025

Se seus node pools rodam Azure Linux 2.0 (Mariner 2.0), voce precisa migrar para o Azure Linux 3.0 antes de novembro de 2025. O Azure Linux 2.0 chega ao fim de vida e deixara de receber patches de seguranca. Nao adie isso.
:::

Verifique o SO atual dos seus nodes:

```bash
# See what OS your nodes are running
az aks nodepool list --resource-group myRG --cluster-name myCluster \
  --query "[].{Name:name, OsType:osType, OsSKU:osSku}" -o table
```

Migre para o Azure Linux 3:

```bash
# Update existing node pool OS SKU
az aks nodepool update --resource-group myRG --cluster-name myCluster \
  --name mynodepool --os-sku AzureLinux
```

## O que o AKS Te Da Pronto Para Uso

Todo cluster AKS, independente do SKU, vem com:

- **CoreDNS** para service discovery dentro do cluster
- **Drivers CSI do Azure Disk e Azure Files** para armazenamento persistente
- **kube-proxy** ou **Cilium** para roteamento de rede (dependendo da sua escolha de CNI)
- **Metrics Server** para HPA/VPA funcionar
- **Azure Identity** webhook para workload identity

O que voce opta por habilitar (e deveria):

- **Azure CNI Overlay com Cilium** -- melhor opcao de rede para a maioria dos clusters. Use.
- **Workload Identity** -- pare de usar pod-managed identity. Ele esta deprecated.
- **Driver CSI do Azure Key Vault** -- monte secrets do Key Vault diretamente nos Pods.
- **App Routing (NGINX gerenciado)** -- use em vez de instalar seu proprio ingress controller.

## Erros Comuns a Evitar

| Erro | Por que Prejudica | O que Fazer |
|------|-------------------|-------------|
| Rodar tier Free em producao | Sem SLA, throttling do API server sob carga | Pague os $73/mes pelo tier Standard |
| Usar rede kubenet | Limitado a 400 nodes, sem network policies, exaustao de SNAT | Use Azure CNI Overlay |
| Pular Workload Identity | Pods usando secrets compartilhados para acessar recursos Azure = incidente de seguranca esperando para acontecer | Habilite federacao de Workload Identity |
| Upgrades manuais de nodes | Voce vai ficar para tras, acumular CVEs | Habilite auto-upgrade de imagem de node no minimo |
| Superdimensionar node pools desde o inicio | Desperdicando dinheiro com computacao ociosa | Comece pequeno, habilite cluster autoscaler com min/max sensiveis |
| Ignorar resource requests/limits | Problemas de noisy neighbor, OOMKills, falhas de agendamento | Sempre defina requests. Defina limits para memoria. |

## Seu Primeiro Cluster em 60 Segundos

```bash
# Create a resource group
az group create --name aks-learning --location eastus2

# Create an AKS cluster (Standard tier, Azure CNI Overlay, 2 nodes)
az aks create \
  --resource-group aks-learning \
  --name my-first-cluster \
  --tier standard \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --node-count 2 \
  --node-vm-size Standard_D4s_v5 \
  --enable-managed-identity \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group aks-learning --name my-first-cluster

# Verify
kubectl get nodes
```

## Recursos

- [Introducao ao AKS](https://learn.microsoft.com/en-us/azure/aks/what-is-aks)
- [Conceitos Fundamentais do AKS](https://learn.microsoft.com/en-us/azure/aks/core-aks-concepts)
- [Tiers de Preco do AKS](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers)
- [Azure Linux no AKS](https://learn.microsoft.com/en-us/azure/aks/use-azure-linux)
- [Workload Identity no AKS](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [Melhores Praticas de Rede no AKS](https://learn.microsoft.com/en-us/azure/aks/concepts-network)

## Laboratorio Pratico

:::tip Coloque a mao na massa

**[Kubernetes do Jeito Facil com AKS Automatic](https://azure-samples.github.io/aks-labs/)**

Faca o deploy da sua primeira aplicacao no AKS. O laboratorio te guia pela criacao do cluster, deployment e escalabilidade em cerca de 45 minutos.
:::

---

**Proximo**: [AKS Automatic vs Standard](./aks-automatic-vs-standard) -- a decisao arquitetural mais importante que voce vai tomar.
