---
sidebar_position: 3
title: "AKS Automatic vs Standard"
description: "Comece com AKS Automatic. Migre para Standard somente quando bater em um limite. Veja exatamente quando e por que."
---

# AKS Automatic vs Standard

Essa é a decisão mais importante que você vai tomar ao criar um cluster AKS. Acerte e você economiza semanas de trabalho de configuração. Erre e você vai lutar contra a plataforma em vez de entregar funcionalidades.

**Minha recomendação forte: Comece com AKS Automatic.** Migre para Standard somente quando você bater em uma limitação concreta que bloqueia seu workload. Não quando você "pode precisar de flexibilidade algum dia." Quando você realmente precisar.

## A diferença central

**AKS Automatic** é uma experiência Kubernetes opinativa e com tudo incluído. A Microsoft toma as decisões de infraestrutura por você com base em melhores práticas. Você faz deploy dos workloads. Só isso.

**AKS Standard** é a experiência de controle total. Você configura tudo: node pools, rede, monitoramento, escalabilidade, políticas de segurança. Mais poder, mais responsabilidade, mais coisas para errar.

:::tip A analogia que funciona

AKS Automatic é como um Tesla -- você entra e dirige. AKS Standard é como montar um carro a partir de um kit -- você pode fazer exatamente o que quiser, mas é melhor saber o que está fazendo ou vai acabar com um veículo que não liga.
:::

## Comparação de funcionalidades

| Capacidade | AKS Automatic | AKS Standard |
|-----------|---------------|--------------|
| **Gerenciamento de nodes** | Node Autoprovision -- K8s escolhe o SKU de VM certo com base nos requisitos do seu workload | Você cria e gerencia node pools manualmente. Você escolhe os tamanhos de VM. |
| **Rede** | Azure CNI Overlay + Cilium. Pre-configurado. Pronto. | Você escolhe: kubenet, Azure CNI, Azure CNI Overlay, Cilium, BYO CNI. |
| **Network policies** | Baseado em Cilium, habilitado por padrão | Você habilita e configura. Calico ou Cilium ou Azure NPM. |
| **Ingress** | App Routing (NGINX gerenciado) incluído | Instale e gerencie seu próprio ingress controller. |
| **Monitoramento** | Azure Monitor, Managed Prometheus, Container Insights -- todos habilitados | Você habilita cada um. Ou não. Sua escolha. |
| **Escalabilidade** | HPA + Node Autoprovision + KEDA integrado | Você configura HPA, Cluster Autoscaler, opcionalmente KEDA. |
| **Padrões de segurança** | Workload Identity habilitado, RBAC obrigatório, Pod Security Standards | Você opta por cada recurso de segurança individualmente. |
| **Manutenção** | Automatizada, agenda gerenciada pela Microsoft | Você configura janelas de manutenção e canais de upgrade. |
| **Imagem do SO** | Azure Linux (mais recente), auto-upgrade | Você escolhe Ubuntu ou Azure Linux, gerencia upgrades. |
| **Suporte a GPU** | Sim, via node autoprovision | Sim, via GPU node pools dedicados. |
| **Nodes Windows** | Não suportado | Totalmente suportado. |
| **Node pools customizados** | Limitado -- autoprovision cuida disso | Controle total sobre quantidade de pools, SKU de VM, taints, labels, zonas. |
| **Clusters privados** | Suportado | Suportado com mais opções de configuração. |
| **CNI customizado/BYOCNI** | Não suportado | Suportado. |

## Quando escolher AKS Automatic (a maioria dos times deve começar aqui)

Escolha Automatic quando:

- Você está fazendo deploy de **workloads padrão**: web apps, APIs, microsserviços, background workers
- Seu time é **pequeno (1-5 engenheiros)** e não pode dedicar alguém para operações do cluster
- Você quer **padrões de produção** sem ler 200 páginas de documentação
- Você valoriza **velocidade de entrega** sobre customização de infraestrutura
- Você é **novo em Kubernetes** e quer guardrails que previnam erros comuns
- Você roda **workloads somente Linux**

:::info O que você ganha sem mover um dedo

Com AKS Automatic, no momento em que seu cluster é criado você tem: Cilium network policies, Managed Prometheus, KEDA para escalabilidade orientada a eventos, Node Autoprovision para nodes com tamanho ideal, Workload Identity para acesso seguro ao Azure, App Routing para ingress, e patching automático de SO. No Standard, configurar tudo isso leva um dia inteiro de trabalho.
:::

## Quando escolher AKS Standard (você vai saber quando precisar)

Escolha Standard quando:

- Você precisa de **Windows node pools** (Automatic não suporta)
- Você requer um **plugin de CNI específico** ou rede BYO que o Automatic não oferece
- Você tem **requisitos de compliance** exigindo imagens de SO de node específicas, agendas de patches ou configurações
- Você roda **workloads especializados** que precisam de controle exato sobre node affinity, taints, tolerations e topology spread constraints em múltiplos node pools customizados
- Você precisa de **múltiplos node pools com SKUs de VM diferentes** gerenciados explicitamente (não via autoprovision)
- Você tem **IaC existente em Terraform/Bicep** que gerencia a configuração do cluster de forma acoplada e você não pode adaptá-lo ao modelo do Automatic
- Você precisa de **customização do kubelet** ou parâmetros customizados de kernel nos nodes

## O erro número um que times cometem

:::warning Não faça engenharia excessiva no primeiro dia

O erro número um é escolher AKS Standard "porque podemos precisar de flexibilidade depois" e então passar 3 semanas configurando rede, monitoramento, escalabilidade e segurança que o AKS Automatic teria te dado em 5 minutos. Quando você termina, você queimou sua sprint com infraestrutura em vez de entregar funcionalidades.

Comece com Automatic. Se você bater em um limite -- um limite real, não um hipotético -- migre para Standard. O caminho de migração existe e é suportado.
:::

## Cenários concretos: qual escolher?

| Cenário | Recomendação | Por que |
|---------|-------------|---------|
| App de microsserviços greenfield, time de 4 | **Automatic** | Entregue funcionalidades, não configuração de infraestrutura |
| App legado .NET Framework em containers Windows | **Standard** | Automatic não suporta nodes Windows |
| SaaS multi-tenant com isolamento de rede estrito por tenant | **Standard** | Você precisa de network policies customizadas e node pools dedicados por tenant |
| Ambiente dev/test para qualquer workload | **Automatic** | Tenha um cluster rodando em minutos, não horas |
| Pipeline de treinamento de ML com nodes GPU | **Standard** | Você precisa de gerenciamento explícito de GPU node pool e spot instances |
| API web padrão com sidecar PostgreSQL | **Automatic** | Node autoprovision cuida do compute, você foca na aplicação |
| Indústria regulada (saúde, financeiro) com requisitos de auditoria específicos | **Standard** | Você precisa de controle sobre janelas de manutenção, versões de patch e egress de rede |
| Time de plataforma servindo 10+ times de dev | **Standard** | Você precisa do toolkit completo para multi-tenancy, políticas customizadas e governança |

## Caminho de migração

**Automatic para Standard**: Suportado. Você pode atualizar o SKU do cluster de Automatic para Standard se ele ficar pequeno para você. Seus workloads continuam rodando durante a migração.

**Standard para Automatic**: Suportado via atualização de SKU. Porém, sua configuração customizada existente pode conflitar com os padrões opinativos do Automatic. Teste completamente antes de migrar.

```bash
# Check your current cluster SKU
az aks show --resource-group myRG --name myCluster --query "sku" -o json

# Migrate from Automatic to Standard (when you need more control)
az aks update --resource-group myRG --name myCluster --sku standard
```

## Preços: SKU vs tier (são coisas diferentes)

Isso confunde todo mundo. Deixa eu ser claro:

- **SKU** (Automatic vs Standard) = determina seu modelo operacional (quanto a Microsoft gerencia para você)
- **Tier** (Free vs Standard vs Premium) = determina seu SLA e capacidades do control plane

Eles são independentes. Você pode ter:

| Combinação | O que Significa |
|------------|-----------------|
| AKS Automatic + tier Standard | Operações opinativas + SLA de produção. **Este é o padrão para Automatic.** |
| AKS Standard + tier Free | Controle total + sem SLA. Bom apenas para dev/test. |
| AKS Standard + tier Standard | Controle total + SLA de produção. **Configuração de produção mais comum.** |
| AKS Standard + tier Premium | Controle total + LTS + recursos avançados. Para workloads de missão crítica. |

:::warning AKS Automatic sempre usa tier Standard no mínimo

Você não pode rodar AKS Automatic no tier Free. Ele requer tier Standard ou Premium porque foi projetado para uso em produção. Se você quer um cluster gratuito para experimentação, use AKS Standard com tier Free.
:::

## Criando cada tipo

**AKS Automatic (ponto de partida recomendado):**

```bash
az aks create \
  --resource-group myRG \
  --name my-auto-cluster \
  --sku automatic \
  --location eastus2
# That is it. No node pool config, no CNI selection, no monitoring setup.
# Everything is configured to best practices automatically.
```

**AKS Standard (quando você precisa de controle total):**

```bash
az aks create \
  --resource-group myRG \
  --name my-standard-cluster \
  --sku standard \
  --tier standard \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --node-count 3 \
  --node-vm-size Standard_D4s_v5 \
  --enable-managed-identity \
  --enable-workload-identity \
  --enable-oidc-issuer \
  --enable-azure-monitor-metrics \
  --enable-keda \
  --location eastus2
# Notice how many flags you need to match what Automatic gives you by default.
```

## Fluxograma de decisão

Faça a si mesmo estas perguntas na ordem:

1. **Você precisa de containers Windows?** Sim = Standard. Não = continue.
2. **Você precisa de um CNI customizado ou rede BYO?** Sim = Standard. Não = continue.
3. **Você tem um pipeline de IaC existente que gerencia node pools explicitamente?** Sim = Standard (a menos que esteja disposto a refatorar). Não = continue.
4. **Você tem mandatos de compliance exigindo versões específicas de SO de node ou agendas de patch?** Sim = Standard. Não = continue.
5. **Nenhuma das anteriores?** = **Use AKS Automatic.**

## Recursos

- [Visão Geral do AKS Automatic](https://learn.microsoft.com/en-us/azure/aks/intro-aks-automatic)
- [Visão Geral do AKS Standard](https://learn.microsoft.com/en-us/azure/aks/what-is-aks)
- [Comparar Tiers de Preço do AKS](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers)
- [Node Autoprovision no AKS](https://learn.microsoft.com/en-us/azure/aks/node-autoprovision)
- [Migrar Entre SKUs do AKS](https://learn.microsoft.com/en-us/azure/aks/intro-aks-automatic#migrate-existing-aks-standard-clusters)

## Laboratório prático

:::tip Experimente você mesmo

**[Kubernetes do Jeito Fácil com AKS Automatic](https://azure-samples.github.io/aks-labs/)**

Crie um cluster AKS Automatic, faça deploy de um workload e veja como Node Autoprovision, monitoramento e ingress funcionam sem nenhuma configuração manual. Cerca de 45 minutos.
:::

---

**Próximo**: [Configuração do Cluster -- Ferramentas](../cluster-setup/tooling) -- configure seu ambiente de desenvolvimento local para trabalhar com AKS.
