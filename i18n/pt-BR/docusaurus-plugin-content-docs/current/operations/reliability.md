---
sidebar_position: 3
title: "Confiabilidade e Alta Disponibilidade"
description: "Guia opinativo sobre padrões de confiabilidade do AKS, zonas de disponibilidade, probes e arquitetura multi-region."
---

# Confiabilidade e alta disponibilidade

Um único cluster AKS com configurações padrão vai te deixar na mão em produção. Nodes morrem. Zonas ficam offline. Pods quebram silenciosamente. Você precisa projetar para falhas desde o primeiro dia, não improvisar depois da primeira indisponibilidade.

## Zonas de disponibilidade

Distribua seus nodes por 3 zonas de disponibilidade. Isso é inegociável para produção.

```bash
# Create a zone-redundant node pool
az aks nodepool add \
  --resource-group myRG \
  --cluster-name myCluster \
  --name workload \
  --zones 1 2 3 \
  --node-count 3
```

:::tip Se sua região suporta zonas, use-as. Sempre.

O custo incremental é zero -- você paga o mesmo por node estando em uma zona ou distribuído em três. Mas a melhoria em resiliência é enorme. Uma falha de zona única derruba 33% da sua capacidade em vez de 100%.
:::

| Configuração | Impacto de Falha de Zona | Pronto para Produção? |
|---------------|--------------------|--------------------|
| Sem zonas | 100% de perda | Não |
| 2 zonas | 50% de perda | Marginal |
| 3 zonas | 33% de perda (sobrevive) | Sim |

## Pod topology spread constraints

Zonas de disponibilidade protegem contra falha de infraestrutura. Topology spread constraints protegem contra agendamento ruim. Sem eles, o Kubernetes pode agendar todas as suas réplicas no mesmo node.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 6
  template:
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: my-app
      - maxSkew: 1
        topologyKey: kubernetes.io/hostname
        whenUnsatisfiable: ScheduleAnyway
        labelSelector:
          matchLabels:
            app: my-app
```

:::warning O erro de confiabilidade mais comum

Fazer deploy de todos os pods em um node e depois perder tudo quando esse node falha. Use topology spread constraints com `topologyKey: kubernetes.io/hostname` para distribuir pods entre nodes, e `topology.kubernetes.io/zone` para distribuir entre zonas.
:::

## Pod Disruption Budgets

PDBs definem a disponibilidade mínima durante interrupções voluntárias (upgrades, node drains, scale-downs). Sem eles, o Kubernetes vai despejar todos os seus pods simultaneamente.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: my-app-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: my-app
```

Use `minAvailable` para serviços que precisam de N instâncias rodando o tempo todo. Use `maxUnavailable` quando quiser expressar "no máximo 1 pod fora por vez."

## Liveness e readiness probes

Todo pod de produção DEVE ter tanto um liveness probe quanto um readiness probe. Eles servem para propósitos diferentes.

| Probe | Propósito | Ação em Falha |
|-------|---------|----------------|
| Liveness | "Este pod está travado?" | Mata e reinicia o pod |
| Readiness | "Este pod consegue servir tráfego?" | Remove dos endpoints do Service |
| Startup | "Este pod ainda está inicializando?" | Atrasa as checagens de liveness |

```yaml
spec:
  containers:
  - name: my-app
    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      initialDelaySeconds: 10
      periodSeconds: 15
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      initialDelaySeconds: 5
      periodSeconds: 5
      failureThreshold: 2
```

:::info Sem probes = sem produção

O Kubernetes não pode te ajudar se não sabe que seu pod está com problema. Sem liveness probe, um pod em deadlock fica ali para sempre consumindo recursos. Sem readiness probe, tráfego é roteado para pods que não conseguem atendê-lo.
:::

## Tiers de SLA do AKS

| Tier | SLA | Zonas de Disponibilidade | Caso de Uso |
|------|-----|-------------------|----------|
| Free | Nenhum (melhor esforço) | Opcional | Dev/test, aprendizado |
| Standard | 99.95% | Opcional (99.99% com zonas) | Produção |
| Premium | 99.95% (+ LTS, funcionalidades mission-critical) | Opcional (99.99% com zonas) | Regulado, enterprise |

Use tier Standard no mínimo para qualquer coisa que serve usuários reais. O tier Free não oferece SLA -- o control plane pode ficar indisponível e a Microsoft não te deve nada.

```bash
az aks update \
  --resource-group myRG \
  --name myCluster \
  --tier standard
```

## Arquitetura multi-region

Para workloads mission-critical que precisam de downtime quase zero, faça deploy de dois clusters em regiões diferentes atrás do Azure Front Door.

**Arquitetura**: Azure Front Door -> Cluster A (East US 2) + Cluster B (West US 2)

Requisitos:
- Ambos os clusters rodam workloads idênticos via GitOps
- Azure Front Door gerencia balanceamento de carga global e failover
- Serviços stateless replicam trivialmente; serviços stateful precisam de uma camada de dados distribuída (Cosmos DB, Azure SQL com geo-replicação)
- O TTL do DNS deve ser baixo (30-60 segundos) para failover rápido

:::tip Comece com single-region, multi-zone

Multi-region é caro e complexo. Para a maioria dos workloads, uma única região com 3 zonas de disponibilidade oferece 99.99% de SLA. Só vá para multi-region se seu RTO for menor que 1 minuto ou se você precisa de redundância geográfica por compliance.
:::

## Checklist de confiabilidade

- [ ] Node pools distribuídos em 3 zonas de disponibilidade
- [ ] Topology spread constraints em todos os deployments
- [ ] PDBs em todos os workloads de produção
- [ ] Liveness e readiness probes em todo container
- [ ] Tier Standard ou Premium de SLA habilitado
- [ ] Pelo menos 3 réplicas para serviços críticos
- [ ] Resource requests e limits definidos (previne vizinhos barulhentos)
- [ ] Cluster autoscaler habilitado com min/max apropriados

## Recursos

- [Best Practices for App and Cluster Reliability](https://learn.microsoft.com/en-us/azure/aks/best-practices-app-cluster-reliability)
- [Deployment Safeguards in AKS](https://learn.microsoft.com/en-us/azure/aks/deployment-safeguards)
- [Availability Zones in AKS](https://learn.microsoft.com/en-us/azure/aks/availability-zones)
- [AKS SLA](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers)
- [Mission-Critical Workloads on AKS](https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-mission-critical/mission-critical-intro)
