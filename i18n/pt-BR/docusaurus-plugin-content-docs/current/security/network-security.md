---
sidebar_position: 3
title: "Segurança de Rede"
description: "Segurança de rede em profundidade para AKS com network policies, bloqueio de egress e observabilidade baseada em Cilium."
---

# Segurança de rede

Network policies são obrigatórias em produção. Se o seu cluster permite comunicação irrestrita entre pods e egress aberto para a internet, você tem zero segurança de rede e uma violação esperando para acontecer. Negue todo o tráfego por padrão, depois permita explicitamente.

## As camadas

Segurança de rede no AKS não é uma coisa só -- são três camadas distintas que devem ser todas configuradas:

| Camada | Ferramenta | Controles |
|--------|------------|-----------|
| Nível de subnet/NIC | NSGs (Network Security Groups) | Ingress/egress amplo na camada de rede do Azure |
| Tráfego de pod no cluster | Network Policies | Comunicação pod-a-pod e pod-a-service |
| Egress do cluster para internet | Azure Firewall / NAT Gateway | Filtragem de FQDN, prevenção de exfiltração de dados |

As três camadas são obrigatórias. NSGs sozinhos não enxergam tráfego pod-a-pod dentro da mesma subnet. Network policies sozinhas não controlam egress para serviços externos.

## Engine de network policy: a decisão

| Engine | Políticas L3/L4 | Políticas L7 | Observabilidade | Performance | Veredito |
|--------|----------------|-------------|-----------------|-------------|----------|
| Azure NPM | Sim | Não | Nenhuma | Moderada | Legado. Evite para novos clusters. |
| Calico | Sim | Limitada | Básica | Boa | Aceitável se já investiu |
| Cilium | Sim | Sim (HTTP, gRPC, DNS) | Hubble (excelente) | Melhor (eBPF) | Use este. |

:::tip

Use Cilium. É a única engine que oferece políticas L7 (filtrar por path HTTP, método gRPC, nome DNS) combinada com observabilidade baseada em eBPF através do Hubble. Você consegue ver cada fluxo de rede no seu cluster em tempo real. O Azure agora suporta Cilium nativamente via Azure CNI Powered by Cilium.
:::

```bash
az aks create \
  --resource-group myRG \
  --name myCluster \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --network-policy cilium
```

## Default deny: comece aqui

Aplique isso a cada namespace antes de fazer deploy de qualquer workload:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

Isso bloqueia todo o tráfego de entrada e saída de cada pod no namespace. Depois adicione políticas de permissão explícitas para cada caminho de comunicação legítimo.

## Permita apenas o necessário

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-api
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api-server
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-egress-to-db
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api-server
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:  # Allow DNS resolution
    - namespaceSelector: {}
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
```

:::info

Sempre inclua uma regra de egress para DNS. Sem ela, os pods não conseguem resolver nomes de serviço e falharão de formas confusas que parecem bugs da aplicação, não problemas de network policy.
:::

## Bloqueio de egress

Deixar egress aberto (`0.0.0.0/0` para a internet) significa que qualquer pod comprometido pode exfiltrar dados para qualquer endpoint externo. Bloqueie.

| Abordagem | Quando Usar | Custo |
|-----------|-------------|-------|
| Azure Firewall com regras de FQDN | Enterprise, requisitos de compliance, logging completo | Alto (~$900/mês mínimo) |
| NAT Gateway + NSG | Sensível a custo, controle básico de egress | Baixo (~$45/mês) |
| Políticas de FQDN do Cilium | Filtragem baseada em DNS no cluster, sem infra adicional | Gratuito (mas menos visibilidade na camada do Azure) |

Para clusters de produção que lidam com dados sensíveis, use Azure Firewall com regras de aplicação que permitem apenas FQDNs específicos:

```bash
# Allow only required egress destinations
az network firewall application-rule create \
  --resource-group myRG \
  --firewall-name myFirewall \
  --collection-name aks-required \
  --priority 200 \
  --action Allow \
  --name aks-fqdn \
  --protocols Https=443 \
  --target-fqdns "mcr.microsoft.com" "*.data.mcr.microsoft.com" "management.azure.com" "login.microsoftonline.com"
```

## Erros comuns

1. **Nenhuma network policy** -- O padrão no Kubernetes é permitir tudo. Sem políticas explícitas, todo pod pode se comunicar com qualquer outro pod. Isso é inaceitável em produção.
2. **Egress aberto** -- Pods não devem alcançar a internet pública a menos que explicitamente necessário. Um container comprometido com egress aberto pode baixar ferramentas, exfiltrar dados ou entrar em um botnet.
3. **Esquecer DNS nas políticas de egress** -- Default-deny de egress bloqueia DNS também. Seus pods falharão ao resolver qualquer nome de serviço. Sempre permita UDP/53 para o kube-dns.
4. **Aplicar políticas sem testar** -- Use modo `enforce` somente após validar com `audit` ou dry-run. Uma network policy ruim pode derrubar toda a sua aplicação instantaneamente.
5. **NSGs como único controle** -- NSGs não enxergam tráfego pod-a-pod dentro da mesma subnet (mesmo CIDR de origem/destino). São necessários, mas não suficientes.

## Recursos

- [Network Policies in AKS](https://learn.microsoft.com/en-us/azure/aks/use-network-policies)
- [Azure CNI Powered by Cilium](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [AKS Egress with Azure Firewall](https://learn.microsoft.com/en-us/azure/aks/limit-egress-traffic)
- [Cilium Network Policy Reference](https://docs.cilium.io/en/stable/security/policy/)
- [Hubble Observability](https://docs.cilium.io/en/stable/observability/)
