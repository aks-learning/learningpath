---
sidebar_position: 2
title: "Opcoes de CNI: Qual Escolher"
description: "Pare de deliberar. Use Azure CNI Overlay com Cilium. Aqui esta o porque, e os raros casos em que voce deve desviar."
---

# Opcoes de CNI: Qual Escolher

Azure CNI Overlay + Cilium. Essa e a recomendacao para 2025. Se voce esta comecando um cluster novo e nao tem restricoes legadas, pare de ler depois desta frase e va construir.

Ainda aqui? Otimo -- vamos cobrir o porque e os casos extremos em que voce desvia.

## Arvore de Decisao

![CNI Decision Tree](/img/cni-decision-tree.svg)

## Comparacao Completa

| Recurso | Azure CNI | Azure CNI Overlay | Azure CNI + Cilium | Kubenet | BYO CNI |
|---------|-----------|-------------------|-------------------|---------|---------|
| **Origem do IP do pod** | Subnet da VNet | CIDR overlay | CIDR overlay | NAT do node | Varia |
| **Consumo de IP da VNet** | 1 IP por pod (pesado) | 1 IP por node apenas | 1 IP por node apenas | 1 IP por node | Varia |
| **Max pods/node** | 250 | 250 | 250 | 110 | Varia |
| **Engine de network policy** | Azure NPM, Calico | Azure NPM, Calico | Cilium (eBPF) | Somente Calico | BYO |
| **Windows node pools** | Sim | Sim | Nao | Nao | Nao |
| **Enderecamento direto de pod** | Sim | Nao (NAT) | Nao (NAT) | Nao (NAT) | Varia |
| **eBPF dataplane** | Nao | Nao | Sim | Nao | Varia |
| **Observabilidade Hubble** | Nao | Nao | Sim | Nao | Nao |
| **Substituicao do kube-proxy** | Nao | Nao | Sim | Nao | Varia |
| **Status** | GA, suportado | GA, recomendado | GA, recomendado | Depreciado | Sem suporte da MS |

## A Recomendacao

:::tip

Use Azure CNI Overlay com Cilium dataplane para todo cluster novo, a menos que voce tenha um motivo especifico e documentado para nao faze-lo.
:::

```bash
# The golden path: CNI Overlay + Cilium
az aks create \
  --name production-cluster \
  --resource-group production-rg \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --pod-cidr 192.168.0.0/16 \
  --service-cidr 10.0.0.0/16 \
  --dns-service-ip 10.0.0.10 \
  --node-count 3 \
  --tier standard
```

Isso lhe da:
- Uso eficiente de IPs (apenas nodes consomem IPs da VNet)
- Roteamento de Services via eBPF (mais rapido que iptables)
- Cilium Network Policies (L3/L4/L7, com reconhecimento de DNS)
- Flow logs e observabilidade via Hubble
- Sem overhead do kube-proxy

## Quando Desviar

### Use Azure CNI (sem overlay) quando:

| Cenario | Motivo |
|---------|--------|
| Pods devem ser diretamente enderecaveis a partir da VNet | Apps legadas conectam a IPs de pods, nao a Services |
| Compliance exige ausencia de overlay/NAT | Ambientes regulados exigindo rastreabilidade completa de IP |
| Integracao com servicos Azure via VNet | Servicos que nao conseguem rotear atraves de um Load Balancer |

```bash
# Azure CNI (non-overlay) -- IP heavy, plan your subnet
az aks create \
  --name legacy-integration \
  --resource-group myrg \
  --network-plugin azure \
  --vnet-subnet-id /subscriptions/.../subnets/large-subnet \
  --max-pods 50  # Reduce to control IP consumption
```

:::warning

Com Azure CNI (sem overlay), um cluster de 3 nodes rodando 50 pods cada consome 153 IPs da VNet (3 nodes + 150 pods). Uma subnet /24 (251 utilizaveis) mal comporta um node pool. Planeje uma /21 ou maior.
:::

### Use Azure CNI (sem overlay) para containers Windows:

Windows node pools nao suportam Cilium. Se voce precisa rodar containers Windows, use Azure CNI ou Azure CNI Overlay sem Cilium. Este e o unico cenario onde Azure NPM ou Calico fazem sentido.

### BYO CNI -- Nao faca isso a menos que voce seja especialista em Cilium/Calico:

O AKS suporta `--network-plugin none` para trazer seu proprio CNI. A Microsoft nao dara suporte a sua camada de rede. Voce e responsavel por debugging, upgrades e compatibilidade. O unico motivo valido: voce ja roda um CNI em toda a frota (ex.: Tigera Enterprise Calico) e precisa de paridade de funcionalidades entre clouds.

## Kubenet: Tecnologia Morta Andando

Kubenet esta depreciado. Nao inicie clusters novos com ele. Veja por que:

- Maximo 110 pods por node (limite rigido)
- Sem suporte a Cilium
- Sem suporte a Windows
- Overhead de gerenciamento de UDR (Azure cria rotas por node)
- Limites de tabela de rotas em 400 nodes
- Sem caminho para recursos modernos (ACNS, Hubble, eBPF)

Se voce tem clusters Kubenet existentes, planeje a migracao para CNI Overlay. Isso requer uma reconstrucao do cluster -- nao existe caminho de upgrade in-place.

## Guia Rapido de Planejamento de IP

| Modo CNI | Formula de dimensionamento de subnet | Exemplo (100 nodes, 50 pods/node) |
|----------|--------------------------------------|-----------------------------------|
| Azure CNI | (nodes * max_pods) + nodes + overhead | 5.100+ IPs necessarios (/19 minimo) |
| CNI Overlay | nodes + overhead | 130 IPs necessarios (/24 e suficiente) |
| Kubenet | nodes + overhead | 130 IPs necessarios (/24 e suficiente) |

A eficiencia de IP por si so ja faz do CNI Overlay a escolha obvia para a maioria dos times.

## Caminho de Migracao

Clusters existentes nao podem trocar de modo CNI in-place. O caminho de migracao e:

1. Criar novo cluster com o CNI alvo (Overlay + Cilium)
2. Implantar workloads no novo cluster
3. Migrar trafego (DNS, Traffic Manager, Front Door)
4. Descomissionar cluster antigo

:::info

Use deployments blue-green de cluster. Nao tente mudancas de CNI in-place -- elas nao sao suportadas e vao quebrar seu cluster.
:::

## Erros Comuns

1. **Escolher Azure CNI sem planejamento de IP** -- Ficar sem IPs as 2 da manha durante um evento de autoscale.
2. **Selecionar Kubenet "porque e mais simples"** -- Voce esta escolhendo divida tecnica desde o primeiro dia.
3. **Usar Azure NPM quando Cilium esta disponivel** -- Azure NPM esta em modo de manutencao. Cilium e o investimento.
4. **Esquecer dual-stack** -- Se voce precisa de IPv6, apenas Azure CNI Overlay suporta de forma limpa.
5. **Superdimensionar subnets para CNI Overlay** -- Voce so precisa de IPs para nodes, nao para pods. Nao desperdice uma faixa /16 da VNet.

## Recursos

- [Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/azure-cni-overlay)
- [Azure CNI Powered by Cilium](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [Configure Azure CNI](https://learn.microsoft.com/en-us/azure/aks/configure-azure-cni)
- [Advanced Container Networking Services](https://learn.microsoft.com/en-us/azure/aks/advanced-container-networking-services-overview)
- [AKS Labs - Networking](https://azure-samples.github.io/aks-labs)

---

**Proximo**: [Ingress e Balanceamento de Carga](./ingress) -- como expor seus workloads.
