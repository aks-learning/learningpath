---
sidebar_position: 5
title: "Service Mesh: Voce Precisa de Um?"
description: "Voce provavelmente nao precisa de um service mesh. Comece sem. Aqui esta como decidir, e o que usar se voce genuinamente precisar."
---

# Service Mesh: Voce Precisa de Um?

Voce provavelmente nao precisa de um service mesh. Comece sem.

Service meshes adicionam complexidade operacional, aumentam o consumo de recursos (sidecar proxies em cada pod) e resolvem problemas que a maioria dos times nao tem de verdade. Antes de recorrer ao Istio, pergunte a si mesmo: network policies + roteamento de ingress resolvem isso?

## O Framework de Decisao

| Voce precisa de... | Sem mesh | Com mesh |
|--------------------|----------|----------|
| Criptografia pod-a-pod (mTLS) | Network policies + pod identity | mTLS automatico em todos os lugares |
| Traffic splitting (canary) | Canary no nivel de ingress (Flagger, AGC) | Traffic splitting L7 por servico |
| Policies de retry/timeout | No nivel da aplicacao (SDK) | No nivel do sidecar (transparente) |
| Circuit breaking | No nivel da aplicacao | No nivel do sidecar |
| Distributed tracing | SDK OpenTelemetry na sua app | Geracao automatica de spans |
| Comunicacao cross-cluster | Configuracao manual | Multi-cluster integrado |
| Observabilidade L7 (metricas HTTP) | Instrumentacao da aplicacao | Automatico a partir dos sidecars |

:::tip

Network policies (Cilium) + retries no nivel da aplicacao + OpenTelemetry cobrem 80% do que os times acham que precisam de um mesh. So adicione um mesh quando voce genuinamente precisar de mTLS transparente entre todos os servicos ou gerenciamento avancado de trafego L7 que nao pode ser feito na camada de ingress.
:::

## Quando Voce PRECISA de um Service Mesh

**Requisitos de networking zero-trust**: Compliance exige que toda chamada servico-a-servico seja criptografada e mutuamente autenticada. Network policies controlam quem pode conectar (L3/L4), mas um mesh adiciona identidade L7 e criptografia.

**Canary deployments no nivel do servico**: Voce precisa enviar 5% do trafego para a v2 de um servico interno (nao apenas no limite do ingress). Isso e traffic splitting L7 de verdade.

**Comunicacao cross-cluster de servicos**: Servicos no Cluster A precisam chamar servicos no Cluster B de forma transparente com balanceamento de carga, retries e mTLS.

**Trilha de auditoria regulatoria**: Voce precisa de logs de acesso por requisicao entre servicos para compliance, sem modificar o codigo da aplicacao.

## Quando Voce NAO Precisa de um Service Mesh

- Voce tem menos de 20 servicos -- o overhead nao compensa
- Seus servicos ja lidam com retries e timeouts (a maioria dos frameworks modernos faz isso)
- Voce so precisa de criptografia em transito -- considere TLS no nivel do pod
- Voce so precisa de traffic splitting na borda -- use AGC ou App Routing
- Voce quer "observabilidade" -- use OpenTelemetry, nao um mesh

## O Add-on de Service Mesh Baseado em Istio

Se voce realmente precisa de um mesh, use o add-on Istio gerenciado pelo AKS. Nao gerencie Istio sozinho -- e operacionalmente caro.

```bash
# Enable the managed Istio add-on
az aks mesh enable \
  --resource-group prod-rg \
  --name prod-cluster

# Verify the mesh is running
az aks show \
  --resource-group prod-rg \
  --name prod-cluster \
  --query "serviceMeshProfile"
```

Habilite injecao de sidecar por namespace:

```bash
# Label namespace for automatic sidecar injection
kubectl label namespace my-app istio.io/rev=asm-1-22
```

```yaml
# Traffic splitting: 90% to v1, 10% to v2
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: my-service
spec:
  hosts:
    - my-service
  http:
    - route:
        - destination:
            host: my-service
            subset: v1
          weight: 90
        - destination:
            host: my-service
            subset: v2
          weight: 10
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: my-service
spec:
  host: my-service
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

O que o add-on gerenciado oferece:
- Microsoft gerencia upgrades do control plane do Istio
- Integrado com Azure Monitor para metricas
- Upgrades canary do proprio mesh baseados em revisao
- Sem gerenciamento de Helm chart, sem upgrades manuais de CRDs

## Alternativas a um Mesh Completo

### Cilium Service Mesh (Mais Leve)

Se voce ja roda Cilium (e deveria -- veja [Comparacao de CNI](./cni-comparison)), voce ganha capacidades basicas de mesh sem sidecars:

- **mTLS** via criptografia baseada em identidade do Cilium (WireGuard ou IPsec no nivel do node)
- **Policies L7** via integracao Cilium Envoy (sem sidecar por pod)
- **Hubble** para observabilidade L7

Isso nao e um service mesh completo, mas cobre a lacuna de criptografia e observabilidade para muitos times sem o custo de sidecars.

```yaml
# Cilium Network Policy with L7 rules (no mesh needed)
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: api-allow-get
spec:
  endpointSelector:
    matchLabels:
      app: api
  ingress:
    - fromEndpoints:
        - matchLabels:
            app: frontend
      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP
          rules:
            http:
              - method: GET
                path: "/api/v1/.*"
```

### Linkerd (Nao Gerenciado pelo AKS)

Linkerd e mais leve que Istio, mas nao e oferecido como add-on gerenciado do AKS. Voce e responsavel pelo ciclo de vida. Use apenas se tiver forte experiencia com Linkerd e precisar do proxy baseado em Rust (menor consumo de recursos que o Envoy).

:::warning

Se voce escolher um mesh nao gerenciado (Linkerd, Istio autogerenciado, Consul Connect), o suporte da Microsoft nao pode ajudar a debugar problemas de rede relacionados ao mesh. A responsabilidade e inteiramente sua.
:::

## Impacto em Recursos

Um service mesh nao e de graca. Planeje para:

| Componente | Custo de Recursos |
|-----------|-------------------|
| Control plane do Istio (istiod) | ~500m CPU, ~1Gi RAM por replica |
| Sidecar proxy (por pod) | ~100m CPU, ~128Mi RAM baseline |
| Overhead de sidecar em cluster de 100 pods | ~10 CPU cores, ~12Gi RAM |

Para um cluster de 100 pods, o custo de sidecars e de aproximadamente 10 CPU cores adicionais e 12 GiB de RAM. Isso e significativo. Certifique-se de que o valor justifique o custo.

## Erros Comuns

1. **Adicionar um mesh "porque a Netflix usa um"** -- A Netflix tem milhares de servicos. Voce tem 12. Network policies resolvem.
2. **Autogerenciar Istio** -- Upgrades do Istio sao notoriamente dolorosos. Use o add-on gerenciado ou nao use Istio.
3. **Habilitar injecao de sidecar em todo o cluster** -- Comece com um namespace. Depure problemas isoladamente antes de expandir.
4. **Ignorar overhead de recursos** -- O custo de memoria dos sidecars se acumula. Um deployment de 100 pods de repente precisa de 12Gi a mais de RAM.
5. **Usar um mesh apenas para criptografia** -- Se voce so precisa de criptografia em transito, considere criptografia WireGuard do Cilium (no nivel do node, sem sidecars) ou TLS no nivel do pod.
6. **Nao treinar o time** -- Um mesh adiciona Envoy, VirtualServices, DestinationRules, PeerAuthentication e AuthorizationPolicy a sua superficie operacional. Reserve tempo para aprendizado.

## Checklist de Decisao

Antes de habilitar um service mesh, responda sim para pelo menos duas:

- [ ] Voce tem mais de 20 servicos se comunicando internamente?
- [ ] mTLS entre todos os servicos e um requisito rigido de compliance?
- [ ] Voce precisa de traffic splitting por servico (nao apenas no ingress)?
- [ ] Voce precisa de retries/timeouts automaticos sem alteracoes na aplicacao?
- [ ] Voce opera em uma topologia multi-cluster?

Se voce marcou zero ou uma: use Cilium network policies e pronto.

## Recursos

- [Istio-based Service Mesh Add-on](https://learn.microsoft.com/en-us/azure/aks/istio-about)
- [Enable Istio Add-on](https://learn.microsoft.com/en-us/azure/aks/istio-deploy-addon)
- [Cilium Service Mesh](https://docs.cilium.io/en/stable/network/servicemesh/)
- [AKS Network Policies with Cilium](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [AKS Labs](https://azure-samples.github.io/aks-labs)

---

**Anterior**: [Clusters Privados](./private-clusters)
