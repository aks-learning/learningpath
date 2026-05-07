---
sidebar_position: 1
title: "Boas Práticas de Arquitetura"
description: "Siga a Arquitetura Baseline do AKS. Não invente a sua. A Microsoft testou isso em escala."
---

# Boas Práticas de Arquitetura

Siga o AKS Baseline. Não invente sua própria arquitetura. A Microsoft testou isso em escala com centenas de clientes corporativos.

## A arquitetura AKS baseline

O AKS Baseline é a arquitetura de referência da Microsoft para Kubernetes em produção. Ele cobre rede, identidade, segurança, operações e padrões de implantação. Comece por aqui, depois personalize.

:::tip Opinião

Comece pelo baseline, depois personalize para suas necessidades. Não o contrário. Times que projetam do zero inevitavelmente redescobrem cada problema que o baseline já resolveu.
:::

## Princípios arquiteturais fundamentais

| Princípio | Implementação | Por que |
|-----------|---------------|---------|
| API server privado | `--enable-private-cluster` | Control plane não exposto à internet |
| Workload Identity | Identidade federada, sem secrets nos pods | Zero credenciais armazenadas, rotação automática |
| Network policies | Calico ou Azure NPM, default-deny | Prevenção de movimentação lateral |
| Availability Zones | 3 zonas para todos os node pools | Sobreviver a falha de datacenter |
| GitOps | Flux ou ArgoCD para deployments | Auditável, repetível, recuperável |
| Managed Identity | Identidades system + user assigned | Sem secrets de service principal para rotacionar |

## Topologia de rede hub-spoke

![Topologia de Rede Hub-Spoke](/img/hub-spoke-topology.svg)

O hub contém serviços compartilhados (Azure Firewall, Bastion, DNS). Cada spoke é um ambiente de workload isolado. O AKS fica em seu próprio spoke com uma subnet dedicada para pods e outra para nodes.

## Componentes do baseline

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

Pular o Azure Firewall para egress significa que seu cluster pode alcançar qualquer endpoint na internet. Um pod comprometido pode exfiltrar dados para qualquer lugar. O firewall adiciona custo, mas é inegociável para workloads regulados.
:::

## Microsserviços no AKS

| Decisão | Recomendação |
|---------|-------------|
| Estratégia de namespace | Um namespace por time de serviço |
| Isolamento de recursos | ResourceQuotas por namespace |
| Limites de rede | NetworkPolicies entre namespaces (default-deny) |
| Comunicação entre serviços | DNS in-cluster para interno, HTTPS para externo |
| Secrets | External Secrets Operator + Key Vault, nunca Kubernetes Secrets diretamente |
| Configuração | ConfigMaps para dados não-sensíveis, Key Vault para dados sensíveis |

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

## Antipadrões a evitar

1. **API server público** -- Seu control plane está na internet. Use private cluster.
2. **Namespace único para todos os workloads** -- Sem isolamento, sem quotas, um time pode deixar outro sem recursos.
3. **Service principals com secrets** -- Use managed identity. Secrets expiram e vazam.
4. **Sem network policies** -- Todo pod pode se comunicar com qualquer outro pod. Uma brecha compromete tudo.
5. **Deploy direto com kubectl** -- Sem trilha de auditoria, sem rollback, sem reprodutibilidade. Use GitOps.
6. **Sem filtragem de egress** -- Pods comprometidos podem se comunicar com qualquer servidor C2.

:::info

A implementação de referência do AKS Baseline é totalmente implantável. Clone o repositório, personalize os parâmetros, faça o deploy. Não construa do zero.
:::

## Recursos

- [AKS Baseline Architecture](https://learn.microsoft.com/azure/architecture/reference-architectures/containers/aks/baseline-aks)
- [AKS Baseline GitHub (implementação de referência)](https://github.com/mspnp/aks-baseline)
- [AKS Landing Zone Accelerator](https://github.com/Azure/AKS-Landing-Zone-Accelerator)
- [Well-Architected Framework para AKS](https://learn.microsoft.com/azure/well-architected/service-guides/azure-kubernetes-service)
