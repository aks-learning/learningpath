---
sidebar_position: 4
title: "Politica de Suporte do AKS"
description: "O que a Microsoft suporta, o que nao suporta, ciclo de vida de versoes e como obter ajuda"
---

# Politica de Suporte do AKS

Mantenha-se na versao N-1 do Kubernetes. Nao espere ate que sua versao saia do suporte. Isso e um incendio que voce nao precisa.

## O que a Microsoft Suporta

| Suportado | Exemplos |
|-----------|----------|
| Control plane do AKS | API server, etcd, scheduler, controller-manager |
| Componentes gerenciados do AKS | CoreDNS, kube-proxy, Azure CNI, CSI drivers |
| Integracoes Azure | Load balancers, discos, managed identity, Defender |
| OS dos nodes (gerenciado) | Patches de OS, atualizacoes de seguranca, problemas de kernel |
| Rede (configurada pelo AKS) | CNI, load balancer, ingress controller (AGIC) |
| Add-ons do AKS | KEDA, KAITO, Azure Policy, Monitoring |

## O que a Microsoft NAO Suporta

| Nao Suportado | Sua Responsabilidade |
|---------------|---------------------|
| Codigo da sua aplicacao | Debugar seus microsservicos |
| Helm charts de terceiros | Problemas com NGINX, cert-manager, Prometheus |
| Operators customizados | Operators que voce instalou |
| Configuracao de workloads | Pod spec, resource requests, health probes |
| Componentes auto-instalados | Service meshes, plugins CNI customizados |
| Recuperacao de dados | Seus backups de banco de dados e dados de PVC |

:::warning

"Meus pods ficam crashando" nao e um problema de suporte do AKS, a menos que o crash seja causado por um bug da plataforma. Crashes de pod por OOMKill, health probes ruins ou erros de aplicacao sao sua responsabilidade. O suporte da Microsoft vai te dizer isso educadamente.
:::

## Suporte de Versao do Kubernetes

O AKS suporta a versao GA minor atual e as duas versoes minor anteriores (N-2).

```
Example (as of early 2025):
  1.31.x  ← Current (GA)
  1.30.x  ← Supported (N-1)
  1.29.x  ← Supported (N-2)
  1.28.x  ← Out of support
```

:::tip Opiniao

Fique na N-1. Voce tem a estabilidade de uma versao comprovada enquanto mantem uma margem confortavel antes do fim do suporte. Times na N-2 estao sempre a um upgrade perdido de uma emergencia.
:::

| Estrategia de Versao | Risco | Melhor Para |
|---------------------|-------|-------------|
| Sempre na mais recente (N) | Bugs novos, breaking changes | Times com testes de CI/CD robustos |
| N-1 (recomendado) | Baixo risco, bem testada | A maioria dos workloads de producao |
| N-2 | Precisa atualizar em breve, pressao | Ambientes regulados com aprovacao lenta |
| Alem de N-2 | Fora de suporte, sem patches | Nunca aceitavel |

## Long-Term Support (LTS)

O tier Premium do AKS inclui Long-Term Support: 2 anos por versao minor em vez de 1 ano.

| Tier | Janela de Suporte da Versao | Caso de Uso |
|------|----------------------------|-------------|
| Standard | ~12 meses por versao minor | A maioria dos times (upgrade anual) |
| Premium (LTS) | ~24 meses por versao minor | Industrias reguladas, controle de mudancas lento |

```bash
# Check your cluster's current version and available upgrades
az aks show --resource-group myrg --name myaks --query "kubernetesVersion"
az aks get-upgrades --resource-group myrg --name myaks --output table
```

## Suporte de OS dos Nodes

| OS | Status | Recomendacao |
|----|--------|-------------|
| Azure Linux (AzureLinux 3) | Recomendado | Menor superficie de ataque, boot mais rapido, mantido pela Microsoft |
| Ubuntu 22.04 | Suportado | Bom para times que precisam de compatibilidade com o ecossistema Ubuntu |
| Azure Linux 2.0 (Mariner) | Descontinuado (Nov 2025) | Migre para AzureLinux 3 agora |
| Windows Server 2022 | Suportado | Necessario para containers Windows |

:::warning

O Azure Linux 2.0 (antigo CBL-Mariner) atinge o fim de vida em novembro de 2025. Se seus node pools o utilizam, planeje a migracao para o AzureLinux 3. Isso nao e opcional -- voce vai parar de receber patches de seguranca.
:::

```bash
# Check your node pool OS SKU
az aks nodepool show \
  --resource-group myrg \
  --cluster-name myaks \
  --name system \
  --query "osSku"
```

## Abrindo um Ticket de Suporte

| Severidade | Tempo de Resposta | Quando Usar |
|------------|-------------------|-------------|
| A (Critica) | 1 hora | Producao fora do ar, indisponibilidade total |
| B (Alta) | 4 horas | Degradacao significativa, indisponibilidade parcial |
| C (Padrao) | 8 horas uteis | Duvidas, problemas nao urgentes |

**O que incluir no ticket:**
1. Resource ID do cluster (`az aks show --query id`)
2. Janela de tempo do problema (UTC)
3. Mensagens de erro (texto exato, nao capturas de tela)
4. O que mudou antes do problema comecar
5. Passos ja tomados para troubleshooting

:::info

Antes de abrir um ticket, verifique o [AKS GitHub Issues](https://github.com/Azure/AKS/issues) -- problemas conhecidos e notas de versao sao publicados la. Muitos "bugs" ja estao documentados com workarounds.
:::

## Planejamento de Upgrade

```bash
# Preview what will change in an upgrade
az aks nodepool get-upgrades \
  --resource-group myrg \
  --cluster-name myaks \
  --nodepool-name system

# Perform a control plane upgrade first, then node pools
az aks upgrade \
  --resource-group myrg \
  --name myaks \
  --kubernetes-version 1.30.4

# Then upgrade node pools
az aks nodepool upgrade \
  --resource-group myrg \
  --cluster-name myaks \
  --name system \
  --kubernetes-version 1.30.4
```

## Recursos

- [Politicas de suporte do AKS](https://learn.microsoft.com/azure/aks/support-policies)
- [Versoes suportadas do Kubernetes](https://learn.microsoft.com/azure/aks/supported-kubernetes-versions)
- [Notas de versao e problemas conhecidos do AKS](https://github.com/Azure/AKS/releases)
- [Long-term support](https://learn.microsoft.com/azure/aks/long-term-support)
