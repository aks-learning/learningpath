---
sidebar_position: 2
title: "O que é AKS?"
description: "Azure Kubernetes Service é o melhor Kubernetes gerenciado no Azure. Control plane gratuito, nativo com Entra ID e rede Azure integrada."
---

# O que é AKS?

Azure Kubernetes Service (AKS) é a plataforma de Kubernetes gerenciado da Microsoft. Ele roda seus workloads containerizados no Azure com um **control plane gratuito e gerenciado pela Microsoft** e worker nodes que ficam na sua subscription.

**AKS é a melhor opção de Kubernetes gerenciado no Azure. Ponto final.** Não considere K8s auto-gerenciado em VMs. Não considere distribuições de K8s de terceiros no Azure. AKS te dá a API completa do Kubernetes com integrações nativas do Azure que nenhuma outra opção pode igualar.

## Arquitetura: o que a Microsoft gerencia vs. o que você administra

![Arquitetura AKS](/img/aks-architecture.svg)

A divisão é clara:

| Componente | Quem Gerencia | O que Isso Significa |
|------------|--------------|----------------------|
| **API Server** | Microsoft | Sempre disponível (SLA de 99.95% no tier Standard). Você nunca aplica patches. |
| **etcd** | Microsoft | Backup feito, replicado, criptografado em repouso. Você nunca toca nisso. |
| **Scheduler + Controller Manager** | Microsoft | Upgrades acontecem automaticamente do lado deles. |
| **Worker Nodes (Node Pools)** | Você | VMs na sua subscription. Você escolhe o SKU, quantidade e regras de escalabilidade. |
| **Pods e Workloads** | Você | Seus containers, sua responsabilidade. |
| **Rede (VNet, LB, DNS)** | Compartilhado | AKS provisiona recursos Azure na sua subscription. Você configura a topologia. |

:::info Ponto-chave

Você paga zero pelo control plane. Seu custo é apenas as VMs dos worker nodes, armazenamento e rede na sua subscription. Isso torna o AKS o ponto de entrada mais barato para Kubernetes em produção em qualquer cloud.
:::

## Por que AKS em vez de outros Kubernetes gerenciados

| Diferencial | Por que Importa |
|-------------|-----------------|
| **Integração com Entra ID** | Sem provedor de identidade separado para gerenciar. Seus desenvolvedores autenticam com credenciais corporativas. Workload Identity dá aos Pods identidade cloud-native sem gerenciar secrets. |
| **Rede nativa do Azure** | Seu cluster vive dentro de uma Azure VNet. Clusters privados, network policies, integração com Azure Firewall -- tudo de primeira classe. Sem gambiarras de overlay. |
| **Upgrades gerenciados** | Escolha entre canais Stable, Rapid ou Node Image. Ou totalmente automático. Sem mais situações de "estamos 4 versões minor atrasados". |
| **Azure Monitor + Prometheus + Grafana** | Stack de observabilidade com um clique. Prometheus gerenciado para métricas, Grafana gerenciado para dashboards, Container Insights para logs. |
| **Defender for Containers** | Detecção de ameaças em runtime, varredura de vulnerabilidades, admission control -- integrado, não remendado. |
| **KEDA integrado** | Autoscaling orientado a eventos sem instalar e manter o operador do KEDA você mesmo. |
| **Pronto para IA/ML** | GPU node pools, KAITO para inferência de modelos, AI Toolchain Operator para pipelines de treinamento. |

## Tiers de preço: escolha o certo

:::warning Não rode produção no tier Free

O tier Free não tem SLA, nenhuma garantia de uptime e recursos limitados do API server. Ele existe apenas para aprendizado e dev/test. Rodar produção no tier Free é pedir por uma indisponibilidade no pior momento possível.
:::

| Tier | Custo Mensal | SLA | Caso de Uso | Recomendação |
|------|-------------|-----|-------------|--------------|
| **Free** | $0 | Nenhum | Dev/test, aprendizado, experimentação | Use apenas para labs e sandboxes |
| **Standard** | ~$73/mês por cluster | 99.95% (com AZs) | Workloads de produção | **Este é seu padrão para produção.** |
| **Premium** | ~$146/mês por cluster | 99.95% | Missão crítica, suporte de longo prazo | Use quando precisar de versões LTS ou recursos avançados |

O custo do tier é APENAS para as capacidades do control plane. Você ainda paga pelas VMs dos seus nodes separadamente.

## Crítico: migração de SO dos nodes necessária

:::warning Descontinuação do Azure Linux 2.0 -- Novembro de 2025

Se seus node pools rodam Azure Linux 2.0 (Mariner 2.0), você precisa migrar para o Azure Linux 3.0 antes de novembro de 2025. O Azure Linux 2.0 chega ao fim de vida e deixará de receber patches de segurança. Não adie isso.
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

## O que o AKS te dá pronto para uso

Todo cluster AKS, independente do SKU, vem com:

- **CoreDNS** para service discovery dentro do cluster
- **Drivers CSI do Azure Disk e Azure Files** para armazenamento persistente
- **kube-proxy** ou **Cilium** para roteamento de rede (dependendo da sua escolha de CNI)
- **Metrics Server** para HPA/VPA funcionar
- **Azure Identity** webhook para workload identity

O que você opta por habilitar (e deveria):

- **Azure CNI Overlay com Cilium** -- melhor opção de rede para a maioria dos clusters. Use.
- **Workload Identity** -- pare de usar pod-managed identity. Ele está deprecated.
- **Driver CSI do Azure Key Vault** -- monte secrets do Key Vault diretamente nos Pods.
- **App Routing (NGINX gerenciado)** -- use em vez de instalar seu próprio ingress controller.

## Erros comuns a evitar

| Erro | Por que Prejudica | O que Fazer |
|------|-------------------|-------------|
| Rodar tier Free em produção | Sem SLA, throttling do API server sob carga | Pague os $73/mês pelo tier Standard |
| Usar rede kubenet | Limitado a 400 nodes, sem network policies, exaustão de SNAT | Use Azure CNI Overlay |
| Pular Workload Identity | Pods usando secrets compartilhados para acessar recursos Azure = incidente de segurança esperando para acontecer | Habilite federação de Workload Identity |
| Upgrades manuais de nodes | Você vai ficar para trás, acumular CVEs | Habilite auto-upgrade de imagem de node no mínimo |
| Superdimensionar node pools desde o início | Desperdicando dinheiro com computação ociosa | Comece pequeno, habilite cluster autoscaler com min/max sensíveis |
| Ignorar resource requests/limits | Problemas de noisy neighbor, OOMKills, falhas de agendamento | Sempre defina requests. Defina limits para memória. |

## Seu primeiro cluster em 60 segundos

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

- [Introdução ao AKS](https://learn.microsoft.com/en-us/azure/aks/what-is-aks)
- [Conceitos Fundamentais do AKS](https://learn.microsoft.com/en-us/azure/aks/core-aks-concepts)
- [Tiers de Preço do AKS](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers)
- [Azure Linux no AKS](https://learn.microsoft.com/en-us/azure/aks/use-azure-linux)
- [Workload Identity no AKS](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [Melhores Práticas de Rede no AKS](https://learn.microsoft.com/en-us/azure/aks/concepts-network)

## Laboratório prático

:::tip Coloque a mão na massa

**[Kubernetes do Jeito Fácil com AKS Automatic](https://azure-samples.github.io/aks-labs/)**

Faça o deploy da sua primeira aplicação no AKS. O laboratório te guia pela criação do cluster, deployment e escalabilidade em cerca de 45 minutos.
:::

---

**Próximo**: [AKS Automatic vs Standard](./aks-automatic-vs-standard) -- a decisão arquitetural mais importante que você vai tomar.
