---
sidebar_position: 3
title: "Seguranca de Rede"
description: "Seguranca de rede em profundidade para AKS com network policies, bloqueio de egress e observabilidade baseada em Cilium."
---

# Seguranca de Rede

Network policies sao obrigatorias em producao. Se o seu cluster permite comunicacao irrestrita entre pods e egress aberto para a internet, voce tem zero seguranca de rede e uma violacao esperando para acontecer. Negue todo o trafego por padrao, depois permita explicitamente.

## As Camadas

Seguranca de rede no AKS nao e uma coisa so -- sao tres camadas distintas que devem ser todas configuradas:

| Camada | Ferramenta | Controles |
|--------|------------|-----------|
| Nivel de subnet/NIC | NSGs (Network Security Groups) | Ingress/egress amplo na camada de rede do Azure |
| Trafego de pod no cluster | Network Policies | Comunicacao pod-a-pod e pod-a-service |
| Egress do cluster para internet | Azure Firewall / NAT Gateway | Filtragem de FQDN, prevencao de exfiltracao de dados |

As tres camadas sao obrigatorias. NSGs sozinhos nao enxergam trafego pod-a-pod dentro da mesma subnet. Network policies sozinhas nao controlam egress para servicos externos.

## Engine de Network Policy: A Decisao

| Engine | Politicas L3/L4 | Politicas L7 | Observabilidade | Performance | Veredito |
|--------|----------------|-------------|-----------------|-------------|----------|
| Azure NPM | Sim | Nao | Nenhuma | Moderada | Legado. Evite para novos clusters. |
| Calico | Sim | Limitada | Basica | Boa | Aceitavel se ja investiu |
| Cilium | Sim | Sim (HTTP, gRPC, DNS) | Hubble (excelente) | Melhor (eBPF) | Use este. |

:::tip

Use Cilium. E a unica engine que oferece politicas L7 (filtrar por path HTTP, metodo gRPC, nome DNS) combinada com observabilidade baseada em eBPF atraves do Hubble. Voce consegue ver cada fluxo de rede no seu cluster em tempo real. O Azure agora suporta Cilium nativamente via Azure CNI Powered by Cilium.
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

## Default Deny: Comece Aqui

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

Isso bloqueia todo o trafego de entrada e saida de cada pod no namespace. Depois adicione politicas de permissao explicitas para cada caminho de comunicacao legitimo.

## Permita Apenas o Necessario

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

Sempre inclua uma regra de egress para DNS. Sem ela, os pods nao conseguem resolver nomes de servico e falharao de formas confusas que parecem bugs da aplicacao, nao problemas de network policy.
:::

## Bloqueio de Egress

Deixar egress aberto (`0.0.0.0/0` para a internet) significa que qualquer pod comprometido pode exfiltrar dados para qualquer endpoint externo. Bloqueie.

| Abordagem | Quando Usar | Custo |
|-----------|-------------|-------|
| Azure Firewall com regras de FQDN | Enterprise, requisitos de compliance, logging completo | Alto (~$900/mes minimo) |
| NAT Gateway + NSG | Sensivel a custo, controle basico de egress | Baixo (~$45/mes) |
| Politicas de FQDN do Cilium | Filtragem baseada em DNS no cluster, sem infra adicional | Gratuito (mas menos visibilidade na camada do Azure) |

Para clusters de producao que lidam com dados sensiveis, use Azure Firewall com regras de aplicacao que permitem apenas FQDNs especificos:

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

## Erros Comuns

1. **Nenhuma network policy** -- O padrao no Kubernetes e permitir tudo. Sem politicas explicitas, todo pod pode se comunicar com qualquer outro pod. Isso e inaceitavel em producao.
2. **Egress aberto** -- Pods nao devem alcancar a internet publica a menos que explicitamente necessario. Um container comprometido com egress aberto pode baixar ferramentas, exfiltrar dados ou entrar em um botnet.
3. **Esquecer DNS nas politicas de egress** -- Default-deny de egress bloqueia DNS tambem. Seus pods falharao ao resolver qualquer nome de servico. Sempre permita UDP/53 para o kube-dns.
4. **Aplicar politicas sem testar** -- Use modo `enforce` somente apos validar com `audit` ou dry-run. Uma network policy ruim pode derrubar toda a sua aplicacao instantaneamente.
5. **NSGs como unico controle** -- NSGs nao enxergam trafego pod-a-pod dentro da mesma subnet (mesmo CIDR de origem/destino). Sao necessarios, mas nao suficientes.

## Recursos

- [Network Policies in AKS](https://learn.microsoft.com/en-us/azure/aks/use-network-policies)
- [Azure CNI Powered by Cilium](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [AKS Egress with Azure Firewall](https://learn.microsoft.com/en-us/azure/aks/limit-egress-traffic)
- [Cilium Network Policy Reference](https://docs.cilium.io/en/stable/security/policy/)
- [Hubble Observability](https://docs.cilium.io/en/stable/observability/)
