---
sidebar_position: 4
title: "Política de Suporte do AKS"
description: "O que a Microsoft suporta, o que não suporta, ciclo de vida de versões e como obter ajuda"
---

# Política de Suporte do AKS

Mantenha-se na versão N-1 do Kubernetes. Não espere até que sua versão saia do suporte. Isso é um incêndio que você não precisa.

## O que a Microsoft suporta

| Suportado | Exemplos |
|-----------|----------|
| Control plane do AKS | API server, etcd, scheduler, controller-manager |
| Componentes gerenciados do AKS | CoreDNS, kube-proxy, Azure CNI, CSI drivers |
| Integrações Azure | Load balancers, discos, managed identity, Defender |
| OS dos nodes (gerenciado) | Patches de OS, atualizações de segurança, problemas de kernel |
| Rede (configurada pelo AKS) | CNI, load balancer, ingress controller (AGIC) |
| Add-ons do AKS | KEDA, KAITO, Azure Policy, Monitoring |

## O que a Microsoft NÃO suporta

| Não Suportado | Sua Responsabilidade |
|---------------|---------------------|
| Código da sua aplicação | Debugar seus microsserviços |
| Helm charts de terceiros | Problemas com NGINX, cert-manager, Prometheus |
| Operators customizados | Operators que você instalou |
| Configuração de workloads | Pod spec, resource requests, health probes |
| Componentes auto-instalados | Service meshes, plugins CNI customizados |
| Recuperação de dados | Seus backups de banco de dados e dados de PVC |

:::warning

"Meus pods ficam crashando" não é um problema de suporte do AKS, a menos que o crash seja causado por um bug da plataforma. Crashes de pod por OOMKill, health probes ruins ou erros de aplicação são sua responsabilidade. O suporte da Microsoft vai te dizer isso educadamente.
:::

## Suporte de versão do Kubernetes

O AKS suporta a versão GA minor atual e as duas versões minor anteriores (N-2).

```
Example (as of early 2025):
  1.31.x  ← Current (GA)
  1.30.x  ← Supported (N-1)
  1.29.x  ← Supported (N-2)
  1.28.x  ← Out of support
```

:::tip Opinião

Fique na N-1. Você tem a estabilidade de uma versão comprovada enquanto mantém uma margem confortável antes do fim do suporte. Times na N-2 estão sempre a um upgrade perdido de uma emergência.
:::

| Estratégia de Versão | Risco | Melhor Para |
|---------------------|-------|-------------|
| Sempre na mais recente (N) | Bugs novos, breaking changes | Times com testes de CI/CD robustos |
| N-1 (recomendado) | Baixo risco, bem testada | A maioria dos workloads de produção |
| N-2 | Precisa atualizar em breve, pressão | Ambientes regulados com aprovação lenta |
| Além de N-2 | Fora de suporte, sem patches | Nunca aceitável |

## Long-Term support (LTS)

O tier Premium do AKS inclui Long-Term Support: 2 anos por versão minor em vez de 1 ano.

| Tier | Janela de Suporte da Versão | Caso de Uso |
|------|----------------------------|-------------|
| Standard | ~12 meses por versão minor | A maioria dos times (upgrade anual) |
| Premium (LTS) | ~24 meses por versão minor | Indústrias reguladas, controle de mudanças lento |

```bash
# Check your cluster's current version and available upgrades
az aks show --resource-group myrg --name myaks --query "kubernetesVersion"
az aks get-upgrades --resource-group myrg --name myaks --output table
```

## Suporte de OS dos nodes

| OS | Status | Recomendação |
|----|--------|-------------|
| Azure Linux (AzureLinux 3) | Recomendado | Menor superfície de ataque, boot mais rápido, mantido pela Microsoft |
| Ubuntu 22.04 | Suportado | Bom para times que precisam de compatibilidade com o ecossistema Ubuntu |
| Azure Linux 2.0 (Mariner) | Descontinuado (Nov 2025) | Migre para AzureLinux 3 agora |
| Windows Server 2022 | Suportado | Necessário para containers Windows |

:::warning

O Azure Linux 2.0 (antigo CBL-Mariner) atinge o fim de vida em novembro de 2025. Se seus node pools o utilizam, planeje a migração para o AzureLinux 3. Isso não é opcional -- você vai parar de receber patches de segurança.
:::

```bash
# Check your node pool OS SKU
az aks nodepool show \
  --resource-group myrg \
  --cluster-name myaks \
  --name system \
  --query "osSku"
```

## Abrindo um ticket de suporte

| Severidade | Tempo de Resposta | Quando Usar |
|------------|-------------------|-------------|
| A (Crítica) | 1 hora | Produção fora do ar, indisponibilidade total |
| B (Alta) | 4 horas | Degradação significativa, indisponibilidade parcial |
| C (Padrão) | 8 horas úteis | Dúvidas, problemas não urgentes |

**O que incluir no ticket:**
1. Resource ID do cluster (`az aks show --query id`)
2. Janela de tempo do problema (UTC)
3. Mensagens de erro (texto exato, não capturas de tela)
4. O que mudou antes do problema começar
5. Passos já tomados para troubleshooting

:::info

Antes de abrir um ticket, verifique o [AKS GitHub Issues](https://github.com/Azure/AKS/issues) -- problemas conhecidos e notas de versão são publicados lá. Muitos "bugs" já estão documentados com workarounds.
:::

## Planejamento de upgrade

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

- [Políticas de suporte do AKS](https://learn.microsoft.com/azure/aks/support-policies)
- [Versões suportadas do Kubernetes](https://learn.microsoft.com/azure/aks/supported-kubernetes-versions)
- [Notas de versão e problemas conhecidos do AKS](https://github.com/Azure/AKS/releases)
- [Long-term support](https://learn.microsoft.com/azure/aks/long-term-support)
