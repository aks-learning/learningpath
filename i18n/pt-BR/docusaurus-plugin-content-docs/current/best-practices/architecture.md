---
sidebar_position: 1
title: "Boas Praticas de Arquitetura"
description: "Siga a Arquitetura Baseline do AKS. Nao invente a sua. A Microsoft testou isso em escala."
---

# Boas Praticas de Arquitetura

Siga o AKS Baseline. Nao invente sua propria arquitetura. A Microsoft testou isso em escala com centenas de clientes corporativos.

## A Arquitetura AKS Baseline

O AKS Baseline e a arquitetura de referencia da Microsoft para Kubernetes em producao. Ele cobre rede, identidade, seguranca, operacoes e padroes de implantacao. Comece por aqui, depois personalize.

:::tip Opiniao

Comece pelo baseline, depois personalize para suas necessidades. Nao o contrario. Times que projetam do zero inevitavelmente redescobrem cada problema que o baseline ja resolveu.
:::

## Principios Arquiteturais Fundamentais

| Principio | Implementacao | Por que |
|-----------|---------------|---------|
| API server privado | `--enable-private-cluster` | Control plane nao exposto a internet |
| Workload Identity | Identidade federada, sem secrets nos pods | Zero credenciais armazenadas, rotacao automatica |
| Network policies | Calico ou Azure NPM, default-deny | Prevencao de movimentacao lateral |
| Availability Zones | 3 zonas para todos os node pools | Sobreviver a falha de datacenter |
| GitOps | Flux ou ArgoCD para deployments | Auditavel, repetivel, recuperavel |
| Managed Identity | Identidades system + user assigned | Sem secrets de service principal para rotacionar |

## Topologia de Rede Hub-Spoke

![Topologia de Rede Hub-Spoke](/img/hub-spoke-topology.svg)

O hub contem servicos compartilhados (Azure Firewall, Bastion, DNS). Cada spoke e um ambiente de workload isolado. O AKS fica em seu proprio spoke com uma subnet dedicada para pods e outra para nodes.

## Componentes do Baseline

```bash
# The baseline includes all of these. Don't skip any for production:
- Azure Firewall (egress control)
- Azure Application Gateway + WAF (ingress)
- Azure Container Registry (private, geo-replicated)
- Azure Key Vault (secrets, certs)
- Azure Monitor + Log Analytics (observability)
- Microsoft Defender for Containers (security)
- Azure Policy (governance)
- Private DNS Zones (name resolution)
```

:::warning

Pular o Azure Firewall para egress significa que seu cluster pode alcancar qualquer endpoint na internet. Um pod comprometido pode exfiltrar dados para qualquer lugar. O firewall adiciona custo, mas e inegociavel para workloads regulados.
:::

## Microsservicos no AKS

| Decisao | Recomendacao |
|---------|-------------|
| Estrategia de namespace | Um namespace por time de servico |
| Isolamento de recursos | ResourceQuotas por namespace |
| Limites de rede | NetworkPolicies entre namespaces (default-deny) |
| Comunicacao entre servicos | DNS in-cluster para interno, HTTPS para externo |
| Secrets | External Secrets Operator + Key Vault, nunca Kubernetes Secrets diretamente |
| Configuracao | ConfigMaps para dados nao-sensiveis, Key Vault para dados sensiveis |

```yaml
# Resource quota per team namespace
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: payments-team
spec:
  hard:
    requests.cpu: "20"
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi
    persistentvolumeclaims: "10"
    services.loadbalancers: "2"
```

## Antipadroes a Evitar

1. **API server publico** -- Seu control plane esta na internet. Use private cluster.
2. **Namespace unico para todos os workloads** -- Sem isolamento, sem quotas, um time pode deixar outro sem recursos.
3. **Service principals com secrets** -- Use managed identity. Secrets expiram e vazam.
4. **Sem network policies** -- Todo pod pode se comunicar com qualquer outro pod. Uma brecha compromete tudo.
5. **Deploy direto com kubectl** -- Sem trilha de auditoria, sem rollback, sem reprodutibilidade. Use GitOps.
6. **Sem filtragem de egress** -- Pods comprometidos podem se comunicar com qualquer servidor C2.

:::info

A implementacao de referencia do AKS Baseline e totalmente implantavel. Clone o repositorio, personalize os parametros, faca o deploy. Nao construa do zero.
:::

## Recursos

- [AKS Baseline Architecture](https://learn.microsoft.com/azure/architecture/reference-architectures/containers/aks/baseline-aks)
- [AKS Baseline GitHub (implementacao de referencia)](https://github.com/mspnp/aks-baseline)
- [AKS Landing Zone Accelerator](https://github.com/Azure/AKS-Landing-Zone-Accelerator)
- [Well-Architected Framework para AKS](https://learn.microsoft.com/azure/well-architected/service-guides/azure-kubernetes-service)
