---
sidebar_position: 1
title: "Upgrades e Manutenção"
description: "Guia opinativo sobre upgrades de clusters AKS, canais de auto-upgrade, janelas de manutenção e configurações de node surge."
---

# Upgrades e Manutenção

O Kubernetes evolui rápido. O AKS descontinua o suporte para versões minor aproximadamente a cada 3 meses. Se você não está fazendo upgrade continuamente, está acumulando dívida técnica que vai te atingir de uma vez.

## Canais de Auto-Upgrade

O AKS oferece cinco canais de auto-upgrade. Escolha um e mantenha-o.

| Canal | Comportamento | Quando Usar |
|---------|----------|----------|
| `none` | Sem upgrades automáticos | Nunca. Sério. |
| `patch` | Aplica versões patch automaticamente (ex: 1.28.3 para 1.28.5) | Clusters legados que você não pode alterar com frequência |
| `stable` | Move para versão minor N-1 após GA+30 dias | Clusters de produção |
| `rapid` | Move para a última versão minor GA imediatamente | Não-prod, staging, canary |
| `node-image` | Atualiza apenas imagens do SO dos nodes, não a versão do K8s | Quando você gerencia upgrades do K8s separadamente |

:::tip Use Stable para produção

Use o canal `stable` para produção. Use `rapid` para não-prod para detectar problemas cedo. Nunca use `none` -- você vai ficar para trás e enfrentar um salto doloroso de múltiplas versões que exige a recriação do seu cluster.
:::

```bash
# Set auto-upgrade channel to stable
az aks update \
  --resource-group myRG \
  --name myCluster \
  --auto-upgrade-channel stable
```

## Janelas de Manutenção

Agende upgrades durante horários de baixo tráfego. Não deixe o Azure escolher uma terça-feira qualquer à tarde.

```bash
# Create a maintenance window: Sundays 2-6 AM UTC
az aks maintenanceconfiguration add \
  --resource-group myRG \
  --cluster-name myCluster \
  --name default \
  --weekday Sunday \
  --start-hour-utc 2 \
  --duration 4
```

As janelas de manutenção se aplicam tanto ao control plane quanto aos upgrades de node pool. Defina um `aksManagedNodeOSUpgradeSchedule` separado para atualizações de imagem de node se quiser horários diferentes.

## Upgrades de Imagem de Node

Upgrades de imagem de node são separados dos upgrades de versão do Kubernetes. Eles aplicam patches no SO, containerd e kubelet sem alterar sua versão do K8s.

:::warning Habilite auto upgrade de imagem de node

Habilite o auto-upgrade `NodeImage` no mínimo. Patches de SO corrigem CVEs. Pular essas atualizações é um incidente de segurança esperando para acontecer.
:::

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --node-os-upgrade-channel NodeImage
```

## Surge Upgrades

A configuração `max-surge` controla quantos nodes extras o AKS provisiona durante um upgrade. Mais node surge = upgrades mais rápidos, mas custo transitório maior.

| Ambiente | max-surge | Justificativa |
|-------------|-----------|-----------|
| Produção | 33% | Mais lento, porém mais seguro. Mantém margem de capacidade. |
| Dev/Test | 1 | Economiza. Downtime é aceitável. |
| Cargas críticas | 50% | Rollout rápido quando você não pode tolerar janelas de upgrade estendidas |

```bash
az aks nodepool update \
  --resource-group myRG \
  --cluster-name myCluster \
  --name nodepool1 \
  --max-surge 33%
```

:::tip Configure max-surge em 33% para produção

Mais lento, porém mais seguro. Com 33%, um terço dos seus nodes é atualizado em paralelo enquanto o restante continua servindo tráfego. Use 1 node para dev/test onde custo importa mais que velocidade.
:::

## Pod Disruption Budgets

Todo workload de produção DEVE ter um Pod Disruption Budget (PDB). Sem PDB, o Kubernetes vai drenar todos os seus pods simultaneamente durante upgrades.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: my-app-pdb
spec:
  minAvailable: "50%"
  selector:
    matchLabels:
      app: my-app
```

:::warning O erro número um em upgrades

Não ter PDBs e depois se perguntar por que upgrades causam downtime. Durante um node drain, o Kubernetes despeja pods o mais rápido possível. Sem PDB, todas as réplicas podem ser despejadas simultaneamente, causando uma indisponibilidade total.
:::

## Long-Term Support (LTS)

O tier Premium do AKS oferece Long-Term Support: 2 anos de suporte a patches por versão minor em vez do padrão de 1 ano. Use LTS quando:

- Você tem requisitos de compliance que impedem alterações frequentes de versão
- Sua aplicação tem dependências rígidas de versões específicas de API do K8s
- Você opera em indústrias reguladas com ciclos longos de controle de mudanças

LTS não significa que você deve parar de fazer upgrade. Significa que você tem mais fôlego.

## Estratégia de Verificação de Upgrade

Não confie cegamente que um upgrade foi bem-sucedido. Valide após cada upgrade.

```bash
# Check node versions after upgrade
kubectl get nodes -o custom-columns=NAME:.metadata.name,VERSION:.status.nodeInfo.kubeletVersion

# Verify all pods are running
kubectl get pods --all-namespaces --field-selector=status.phase!=Running,status.phase!=Succeeded

# Check for deprecated API usage before upgrading
kubectl get --raw /metrics | grep apiserver_requested_deprecated_apis
```

:::info Checklist pré-upgrade

1. Execute `kubectl deprecations` (ou `kubent`) para encontrar APIs depreciadas
2. Verifique se PDBs existem para todos os workloads críticos
3. Confirme que o cluster autoscaler tem margem para nodes de surge
4. Verifique se sua subnet tem IPs livres suficientes para nodes de max-surge
5. Teste o upgrade em um cluster não-prod primeiro usando o canal `rapid`
:::

## Rollback

O AKS não suporta downgrade de versão do Kubernetes. Se um upgrade quebrar algo:

- Corrija para frente aplicando patches nos seus workloads para torná-los compatíveis
- Restaure a partir de backup para um novo cluster rodando a versão anterior
- Use estratégia Blue-Green de cluster: mantenha o cluster antigo até o novo ser validado

É por isso que clusters de staging com canal `rapid` são importantes. Detecte breaking changes antes que atinjam a produção.

## Erros Comuns

1. **Usar canal `none`** -- Você vai pular 3+ versões minor, e então descobrir remoções de API de uma vez
2. **Sem PDBs** -- Upgrades se tornam indisponibilidades não planejadas
3. **Sem janela de manutenção** -- Upgrades acontecem durante pico de tráfego
4. **Ignorar upgrades de imagem de node** -- Seus nodes acumulam CVEs sem patch
5. **Configurar max-surge em 100%** -- Dobra temporariamente a quantidade de nodes e pode esgotar IPs da subnet
6. **Não verificar APIs depreciadas** -- Upgrade funciona mas workloads quebram porque os manifests usam APIs removidas
7. **Fazer upgrade em produção primeiro** -- Sempre faça upgrade em não-prod primeiro. Sempre.

## Recursos

- [Upgrade AKS Clusters](https://learn.microsoft.com/en-us/azure/aks/upgrade-cluster)
- [Auto-upgrade Channels](https://learn.microsoft.com/en-us/azure/aks/auto-upgrade-cluster)
- [Planned Maintenance Windows](https://learn.microsoft.com/en-us/azure/aks/planned-maintenance)
- [Node OS Auto-upgrade](https://learn.microsoft.com/en-us/azure/aks/auto-upgrade-node-os-image)
- [AKS Long-Term Support](https://learn.microsoft.com/en-us/azure/aks/long-term-support)
