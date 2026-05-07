---
sidebar_position: 1
title: "Fundamentos de Networking no AKS"
description: "O networking do AKS é nativo de Azure VNet. Entenda os três modelos de rede, planejamento de IP, DNS e por que o Cilium é o único mecanismo de network policy que vale a pena usar."
---

# Fundamentos de networking no AKS

O networking do AKS não é Kubernetes networking com uma camada Azure por cima. É networking nativo de Azure VNet que por acaso roda Kubernetes. Seus pods recebem IPs reais -- seja diretamente dentro da sua VNet ou dentro de uma rede overlay com os nodes fazendo ponte do tráfego. Entender essa distinção é a base para toda decisão de networking que você vai tomar.

## Os três modelos de rede

| Modelo | IPs dos Pods | IPs dos Nodes | Status |
|--------|-------------|---------------|--------|
| **Azure CNI** | IPs da subnet da VNet | IPs da subnet da VNet | Pronto para produção, consome muitos IPs |
| **Azure CNI Overlay** | CIDR overlay (privado) | IPs da subnet da VNet | Pronto para produção, recomendado |
| **Kubenet** | NAT no nível do node | IPs da subnet da VNet | Depreciado. Não use. |

:::tip A Regra dos 90%

Use Azure CNI Overlay para 90% dos workloads. Só use Azure CNI (sem overlay) quando você precisar que os pods sejam diretamente endereçáveis a partir da VNet -- ou seja, sistemas externos precisam iniciar conexões para IPs específicos de pods sem passar por um Service ou Ingress.
:::

## Planejamento de endereçamento IP

É aqui que os times se queimam. Planeje seus CIDRs antes de criar o cluster:

```bash
# Example: Creating a cluster with proper CIDR planning
az aks create \
  --name myaks \
  --resource-group myrg \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --pod-cidr 192.168.0.0/16 \
  --service-cidr 10.0.0.0/16 \
  --dns-service-ip 10.0.0.10 \
  --vnet-subnet-id /subscriptions/.../subnets/aks-subnet
```

| CIDR | Finalidade | Orientação de Dimensionamento |
|------|-----------|-------------------------------|
| **Pod CIDR** | Pool de IPs para todos os pods (apenas overlay) | /16 fornece 65k IPs. Use. |
| **Service CIDR** | Faixa de ClusterIP para Kubernetes Services | /16 é generoso, /20 é o mínimo |
| **Subnet CIDR** | Subnet da VNet para nodes | Dimensione para o máximo de nodes + 30% de margem |
| **DNS Service IP** | Deve estar dentro do Service CIDR | Convencionalmente .10 da faixa |

:::warning

Você não pode alterar o Pod CIDR ou o Service CIDR após a criação do cluster. Acerte isso no primeiro dia ou encare uma reconstrução do cluster.
:::

## DNS: CoreDNS

Todo cluster AKS roda CoreDNS para resolução de nomes dentro do cluster. Services recebem entradas DNS como `my-svc.my-namespace.svc.cluster.local`. Isso é Kubernetes padrão.

O que importa em produção:

- **DNS customizado**: Use o ConfigMap `coredns-custom` para encaminhar domínios corporativos para DNS on-premises
- **Configuração ndots**: O padrão `ndots:5` causa buscas DNS excessivas. Defina como 2 nos specs dos seus pods para workloads que fazem muitas chamadas externas
- **Autoscaling de DNS**: O CoreDNS escala com a quantidade de nodes via `cluster-proportional-autoscaler`

```yaml
# Reduce DNS lookup noise for pods calling external APIs
apiVersion: v1
kind: Pod
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"
```

## kube-proxy vs Cilium eBPF data plane

O AKS tradicional usa kube-proxy (modo iptables) para roteamento de Services. Funciona, mas escala mal acima de 5.000 Services e não oferece nenhuma observabilidade sobre os fluxos de tráfego.

:::tip

Habilite Cilium para network policies. Não use Azure NPM ou Calico -- Cilium é o futuro e oferece observabilidade via eBPF de graça. Com ACNS (Advanced Container Networking Services), você ganha policies com reconhecimento de DNS, flow logs e Hubble UI prontos para uso.
:::

```bash
# Create cluster with Cilium data plane (replaces kube-proxy)
az aks create \
  --name myaks \
  --resource-group myrg \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --pod-cidr 192.168.0.0/16
```

Com Cilium como data plane:
- **Sem kube-proxy** -- eBPF lida com roteamento de Services no nível do kernel
- **Network policies** -- Cilium Network Policies (mais expressivas que Kubernetes NetworkPolicy)
- **Hubble** -- Visibilidade de fluxos, logging de DNS, policies com reconhecimento HTTP
- **Performance** -- Lookups em tempo constante vs caminhamento linear de cadeias iptables

## Network policies: o inegociável

Em produção em escala, você deve aplicar network policies. Sem elas, qualquer pod comprometido pode acessar qualquer outro pod no cluster -- incluindo seus pods de banco de dados, armazenamento de secrets e componentes do control plane.

```yaml
# Deny all ingress by default, then allow explicitly
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

Comece com deny-all em cada namespace e depois abra exceções conforme necessário. Esse é o único padrão sensato para workloads de produção.

## Erros comuns

1. **Usar Kubenet para clusters novos** -- Ele está depreciado. Não há razão para escolhê-lo em 2025.
2. **Subdimensionar a subnet dos nodes** -- Esquecer que o AKS reserva IPs para pods de sistema, upgrades (surge) e load balancers.
3. **Ignorar ndots** -- Um pod fazendo 10 chamadas de API externas gera 50 consultas DNS com o ndots:5 padrão.
4. **Escolher Azure NPM para network policies** -- Está em modo de manutenção. Cilium é desenvolvido ativamente e oferece funcionalidade superior.
5. **Não habilitar network policies** -- Por padrão, todos os pods podem se comunicar com todos os pods. Isso é inaceitável em produção.
6. **CIDRs sobrepostos** -- Pod CIDR, Service CIDR e espaço de endereços da VNet não podem se sobrepor. Parece óbvio, mas é esquecido em configurações multi-cluster.

## Recursos

- [AKS Networking Concepts](https://learn.microsoft.com/en-us/azure/aks/concepts-network)
- [Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/azure-cni-overlay)
- [Advanced Container Networking Services](https://learn.microsoft.com/en-us/azure/aks/advanced-container-networking-services-overview)
- [Cilium on AKS](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [AKS Labs - Networking](https://azure-samples.github.io/aks-labs)

---

**Próximo**: [Comparação de CNI](./cni-comparison) -- escolha o CNI certo para o seu cluster.
