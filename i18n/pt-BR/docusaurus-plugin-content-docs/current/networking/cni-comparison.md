---
sidebar_position: 2
title: "Opções de CNI: Qual Escolher"
description: "Pare de deliberar. Use Azure CNI Overlay com Cilium. Aqui está o porque, e os raros casos em que você deve desviar."
---

# Opções de CNI: qual escolher

Azure CNI Overlay + Cilium. Essa é a recomendação para 2025. Se você está começando um cluster novo e não tem restrições legadas, pare de ler depois desta frase e vá construir.

Ainda aqui? Ótimo -- vamos cobrir o porque e os casos extremos em que você desvia.

## Árvore de decisão

![CNI Decision Tree](/img/cni-decision-tree.svg)

## Comparação completa

| Recurso | Azure CNI | Azure CNI Overlay | Azure CNI + Cilium | Kubenet | BYO CNI |
|---------|-----------|-------------------|-------------------|---------|---------|
| **Origem do IP do pod** | Subnet da VNet | CIDR overlay | CIDR overlay | NAT do node | Varia |
| **Consumo de IP da VNet** | 1 IP por pod (pesado) | 1 IP por node apenas | 1 IP por node apenas | 1 IP por node | Varia |
| **Max pods/node** | 250 | 250 | 250 | 110 | Varia |
| **Engine de network policy** | Azure NPM, Calico | Azure NPM, Calico | Cilium (eBPF) | Somente Calico | BYO |
| **Windows node pools** | Sim | Sim | Não | Não | Não |
| **Endereçamento direto de pod** | Sim | Não (NAT) | Não (NAT) | Não (NAT) | Varia |
| **eBPF dataplane** | Não | Não | Sim | Não | Varia |
| **Observabilidade Hubble** | Não | Não | Sim | Não | Não |
| **Substituição do kube-proxy** | Não | Não | Sim | Não | Varia |
| **Status** | GA, suportado | GA, recomendado | GA, recomendado | Depreciado | Sem suporte dá MS |

## A recomendação

:::tip

Use Azure CNI Overlay com Cilium dataplane para todo cluster novo, a menos que você tenha um motivo específico e documentado para não faze-lo.
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

Isso lhe dá:
- Uso eficiente de IPs (apenas nodes consomem IPs da VNet)
- Roteamento de Services via eBPF (mais rápido que iptables)
- Cilium Network Policies (L3/L4/L7, com reconhecimento de DNS)
- Flow logs e observabilidade via Hubble
- Sem overhead do kube-proxy

## Quando desviar

### Use Azure CNI (sem overlay) quando:

| Cenário | Motivo |
|---------|--------|
| Pods devem ser diretamente endereçáveis a partir da VNet | Apps legadas conectam a IPs de pods, não a Services |
| Compliance exige ausência de overlay/NAT | Ambientes regulados exigindo rastreabilidade completa de IP |
| Integração com serviços Azure via VNet | Serviços que não conseguem rotear através de um Load Balancer |

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

Com Azure CNI (sem overlay), um cluster de 3 nodes rodando 50 pods cada consome 153 IPs da VNet (3 nodes + 150 pods). Uma subnet /24 (251 utilizáveis) mal comporta um node pool. Planeje uma /21 ou maior.
:::

### Use Azure CNI (sem overlay) para containers Windows:

Windows node pools não suportam Cilium. Se você precisa rodar containers Windows, use Azure CNI ou Azure CNI Overlay sem Cilium. Este é o único cenário onde Azure NPM ou Calico fazem sentido.

### BYO CNI -- não faça isso a menos que você seja especialista em Cilium/Calico:

O AKS suporta `--network-plugin none` para trazer seu próprio CNI. A Microsoft não dará suporte a sua camada de rede. Você é responsável por debugging, upgrades e compatibilidade. O único motivo válido: você já roda um CNI em toda a frota (ex.: Tigera Enterprise Calico) e precisa de paridade de funcionalidades entre clouds.

## Kubenet: tecnologia morta andando

Kubenet está depreciado. Não inicie clusters novos com ele. Veja por que:

- Máximo 110 pods por node (limite rígido)
- Sem suporte a Cilium
- Sem suporte a Windows
- Overhead de gerenciamento de UDR (Azure cria rotas por node)
- Limites de tabela de rotas em 400 nodes
- Sem caminho para recursos modernos (ACNS, Hubble, eBPF)

Se você tem clusters Kubenet existentes, planeje a migração para CNI Overlay. Isso requer uma reconstrução do cluster -- não existe caminho de upgrade in-place.

## Guia rápido de planejamento de IP

| Modo CNI | Fórmula de dimensionamento de subnet | Exemplo (100 nodes, 50 pods/node) |
|----------|--------------------------------------|-----------------------------------|
| Azure CNI | (nodes * max_pods) + nodes + overhead | 5.100+ IPs necessários (/19 mínimo) |
| CNI Overlay | nodes + overhead | 130 IPs necessários (/24 é suficiente) |
| Kubenet | nodes + overhead | 130 IPs necessários (/24 é suficiente) |

A eficiência de IP por si só já faz do CNI Overlay a escolha óbvia para a maioria dos times.

## Caminho de migração

Clusters existentes não podem trocar de modo CNI in-place. O caminho de migração é:

1. Criar novo cluster com o CNI alvo (Overlay + Cilium)
2. Implantar workloads no novo cluster
3. Migrar tráfego (DNS, Traffic Manager, Front Door)
4. Descomissionar cluster antigo

:::info

Use deployments blue-green de cluster. Não tente mudanças de CNI in-place -- elas não são suportadas e vão quebrar seu cluster.
:::

## Erros comuns

1. **Escolher Azure CNI sem planejamento de IP** -- Ficar sem IPs as 2 da manhã durante um evento de autoscale.
2. **Selecionar Kubenet "porque é mais simples"** -- Você está escolhendo dívida técnica desde o primeiro dia.
3. **Usar Azure NPM quando Cilium está disponível** -- Azure NPM está em modo de manutenção. Cilium é o investimento.
4. **Esquecer dual-stack** -- Se você precisa de IPv6, apenas Azure CNI Overlay suporta de forma limpa.
5. **Superdimensionar subnets para CNI Overlay** -- Você só precisa de IPs para nodes, não para pods. Não desperdice uma faixa /16 da VNet.

## Recursos

- [Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/azure-cni-overlay)
- [Azure CNI Powered by Cilium](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [Configure Azure CNI](https://learn.microsoft.com/en-us/azure/aks/configure-azure-cni)
- [Advanced Container Networking Services](https://learn.microsoft.com/en-us/azure/aks/advanced-container-networking-services-overview)
- [AKS Labs - Networking](https://azure-samples.github.io/aks-labs)

---

**Próximo**: [Ingress e Balanceamento de Carga](./ingress) -- como expor seus workloads.
