---
sidebar_position: 3
title: "AKS Automatic vs Standard"
description: "Comece com AKS Automatic. Migre para Standard somente quando bater em um limite. Veja exatamente quando e por que."
---

# AKS Automatic vs Standard

Essa e a decisao mais importante que voce vai tomar ao criar um cluster AKS. Acerte e voce economiza semanas de trabalho de configuracao. Erre e voce vai lutar contra a plataforma em vez de entregar funcionalidades.

**Minha recomendacao forte: Comece com AKS Automatic.** Migre para Standard somente quando voce bater em uma limitacao concreta que bloqueia seu workload. Nao quando voce "pode precisar de flexibilidade algum dia." Quando voce realmente precisar.

## A Diferenca Central

**AKS Automatic** e uma experiencia Kubernetes opinativa e com tudo incluido. A Microsoft toma as decisoes de infraestrutura por voce com base em melhores praticas. Voce faz deploy dos workloads. So isso.

**AKS Standard** e a experiencia de controle total. Voce configura tudo: node pools, rede, monitoramento, escalabilidade, politicas de seguranca. Mais poder, mais responsabilidade, mais coisas para errar.

:::tip A analogia que funciona

AKS Automatic e como um Tesla -- voce entra e dirige. AKS Standard e como montar um carro a partir de um kit -- voce pode fazer exatamente o que quiser, mas e melhor saber o que esta fazendo ou vai acabar com um veiculo que nao liga.
:::

## Comparacao de Funcionalidades

| Capacidade | AKS Automatic | AKS Standard |
|-----------|---------------|--------------|
| **Gerenciamento de nodes** | Node Autoprovision -- K8s escolhe o SKU de VM certo com base nos requisitos do seu workload | Voce cria e gerencia node pools manualmente. Voce escolhe os tamanhos de VM. |
| **Rede** | Azure CNI Overlay + Cilium. Pre-configurado. Pronto. | Voce escolhe: kubenet, Azure CNI, Azure CNI Overlay, Cilium, BYO CNI. |
| **Network policies** | Baseado em Cilium, habilitado por padrao | Voce habilita e configura. Calico ou Cilium ou Azure NPM. |
| **Ingress** | App Routing (NGINX gerenciado) incluido | Instale e gerencie seu proprio ingress controller. |
| **Monitoramento** | Azure Monitor, Managed Prometheus, Container Insights -- todos habilitados | Voce habilita cada um. Ou nao. Sua escolha. |
| **Escalabilidade** | HPA + Node Autoprovision + KEDA integrado | Voce configura HPA, Cluster Autoscaler, opcionalmente KEDA. |
| **Padroes de seguranca** | Workload Identity habilitado, RBAC obrigatorio, Pod Security Standards | Voce opta por cada recurso de seguranca individualmente. |
| **Manutencao** | Automatizada, agenda gerenciada pela Microsoft | Voce configura janelas de manutencao e canais de upgrade. |
| **Imagem do SO** | Azure Linux (mais recente), auto-upgrade | Voce escolhe Ubuntu ou Azure Linux, gerencia upgrades. |
| **Suporte a GPU** | Sim, via node autoprovision | Sim, via GPU node pools dedicados. |
| **Nodes Windows** | Nao suportado | Totalmente suportado. |
| **Node pools customizados** | Limitado -- autoprovision cuida disso | Controle total sobre quantidade de pools, SKU de VM, taints, labels, zonas. |
| **Clusters privados** | Suportado | Suportado com mais opcoes de configuracao. |
| **CNI customizado/BYOCNI** | Nao suportado | Suportado. |

## Quando Escolher AKS Automatic (A Maioria dos Times Deve Comecar Aqui)

Escolha Automatic quando:

- Voce esta fazendo deploy de **workloads padrao**: web apps, APIs, microservicos, background workers
- Seu time e **pequeno (1-5 engenheiros)** e nao pode dedicar alguem para operacoes do cluster
- Voce quer **padroes de producao** sem ler 200 paginas de documentacao
- Voce valoriza **velocidade de entrega** sobre customizacao de infraestrutura
- Voce e **novo em Kubernetes** e quer guardrails que previnam erros comuns
- Voce roda **workloads somente Linux**

:::info O que voce ganha sem mover um dedo

Com AKS Automatic, no momento em que seu cluster e criado voce tem: Cilium network policies, Managed Prometheus, KEDA para escalabilidade orientada a eventos, Node Autoprovision para nodes com tamanho ideal, Workload Identity para acesso seguro ao Azure, App Routing para ingress, e patching automatico de SO. No Standard, configurar tudo isso leva um dia inteiro de trabalho.
:::

## Quando Escolher AKS Standard (Voce Vai Saber Quando Precisar)

Escolha Standard quando:

- Voce precisa de **Windows node pools** (Automatic nao suporta)
- Voce requer um **plugin de CNI especifico** ou rede BYO que o Automatic nao oferece
- Voce tem **requisitos de compliance** exigindo imagens de SO de node especificas, agendas de patches ou configuracoes
- Voce roda **workloads especializados** que precisam de controle exato sobre node affinity, taints, tolerations e topology spread constraints em multiplos node pools customizados
- Voce precisa de **multiplos node pools com SKUs de VM diferentes** gerenciados explicitamente (nao via autoprovision)
- Voce tem **IaC existente em Terraform/Bicep** que gerencia a configuracao do cluster de forma acoplada e voce nao pode adapta-lo ao modelo do Automatic
- Voce precisa de **customizacao do kubelet** ou parametros customizados de kernel nos nodes

## O Erro Numero Um que Times Cometem

:::warning Nao faca engenharia excessiva no primeiro dia

O erro numero um e escolher AKS Standard "porque podemos precisar de flexibilidade depois" e entao passar 3 semanas configurando rede, monitoramento, escalabilidade e seguranca que o AKS Automatic teria te dado em 5 minutos. Quando voce termina, voce queimou sua sprint com infraestrutura em vez de entregar funcionalidades.

Comece com Automatic. Se voce bater em um limite -- um limite real, nao um hipotetico -- migre para Standard. O caminho de migracao existe e e suportado.
:::

## Cenarios Concretos: Qual Escolher?

| Cenario | Recomendacao | Por que |
|---------|-------------|---------|
| App de microservicos greenfield, time de 4 | **Automatic** | Entregue funcionalidades, nao configuracao de infraestrutura |
| App legado .NET Framework em containers Windows | **Standard** | Automatic nao suporta nodes Windows |
| SaaS multi-tenant com isolamento de rede estrito por tenant | **Standard** | Voce precisa de network policies customizadas e node pools dedicados por tenant |
| Ambiente dev/test para qualquer workload | **Automatic** | Tenha um cluster rodando em minutos, nao horas |
| Pipeline de treinamento de ML com nodes GPU | **Standard** | Voce precisa de gerenciamento explicito de GPU node pool e spot instances |
| API web padrao com sidecar PostgreSQL | **Automatic** | Node autoprovision cuida do compute, voce foca na aplicacao |
| Industria regulada (saude, financeiro) com requisitos de auditoria especificos | **Standard** | Voce precisa de controle sobre janelas de manutencao, versoes de patch e egress de rede |
| Time de plataforma servindo 10+ times de dev | **Standard** | Voce precisa do toolkit completo para multi-tenancy, politicas customizadas e governanca |

## Caminho de Migracao

**Automatic para Standard**: Suportado. Voce pode atualizar o SKU do cluster de Automatic para Standard se ele ficar pequeno para voce. Seus workloads continuam rodando durante a migracao.

**Standard para Automatic**: Suportado via atualizacao de SKU. Porem, sua configuracao customizada existente pode conflitar com os padroes opinativos do Automatic. Teste completamente antes de migrar.

```bash
# Check your current cluster SKU
az aks show --resource-group myRG --name myCluster --query "sku" -o json

# Migrate from Automatic to Standard (when you need more control)
az aks update --resource-group myRG --name myCluster --sku standard
```

## Precos: SKU vs Tier (Sao Coisas Diferentes)

Isso confunde todo mundo. Deixa eu ser claro:

- **SKU** (Automatic vs Standard) = determina seu modelo operacional (quanto a Microsoft gerencia para voce)
- **Tier** (Free vs Standard vs Premium) = determina seu SLA e capacidades do control plane

Eles sao independentes. Voce pode ter:

| Combinacao | O que Significa |
|------------|-----------------|
| AKS Automatic + tier Standard | Operacoes opinativas + SLA de producao. **Este e o padrao para Automatic.** |
| AKS Standard + tier Free | Controle total + sem SLA. Bom apenas para dev/test. |
| AKS Standard + tier Standard | Controle total + SLA de producao. **Configuracao de producao mais comum.** |
| AKS Standard + tier Premium | Controle total + LTS + recursos avancados. Para workloads de missao critica. |

:::warning AKS Automatic sempre usa tier Standard no minimo

Voce nao pode rodar AKS Automatic no tier Free. Ele requer tier Standard ou Premium porque foi projetado para uso em producao. Se voce quer um cluster gratuito para experimentacao, use AKS Standard com tier Free.
:::

## Criando Cada Tipo

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

**AKS Standard (quando voce precisa de controle total):**

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

## Fluxograma de Decisao

Faca a si mesmo estas perguntas na ordem:

1. **Voce precisa de containers Windows?** Sim = Standard. Nao = continue.
2. **Voce precisa de um CNI customizado ou rede BYO?** Sim = Standard. Nao = continue.
3. **Voce tem um pipeline de IaC existente que gerencia node pools explicitamente?** Sim = Standard (a menos que esteja disposto a refatorar). Nao = continue.
4. **Voce tem mandatos de compliance exigindo versoes especificas de SO de node ou agendas de patch?** Sim = Standard. Nao = continue.
5. **Nenhuma das anteriores?** = **Use AKS Automatic.**

## Recursos

- [Visao Geral do AKS Automatic](https://learn.microsoft.com/en-us/azure/aks/intro-aks-automatic)
- [Visao Geral do AKS Standard](https://learn.microsoft.com/en-us/azure/aks/what-is-aks)
- [Comparar Tiers de Preco do AKS](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers)
- [Node Autoprovision no AKS](https://learn.microsoft.com/en-us/azure/aks/node-autoprovision)
- [Migrar Entre SKUs do AKS](https://learn.microsoft.com/en-us/azure/aks/intro-aks-automatic#migrate-existing-aks-standard-clusters)

## Laboratorio Pratico

:::tip Experimente voce mesmo

**[Kubernetes do Jeito Facil com AKS Automatic](https://azure-samples.github.io/aks-labs/)**

Crie um cluster AKS Automatic, faca deploy de um workload e veja como Node Autoprovision, monitoramento e ingress funcionam sem nenhuma configuracao manual. Cerca de 45 minutos.
:::

---

**Proximo**: [Configuracao do Cluster -- Ferramentas](../cluster-setup/tooling) -- configure seu ambiente de desenvolvimento local para trabalhar com AKS.
