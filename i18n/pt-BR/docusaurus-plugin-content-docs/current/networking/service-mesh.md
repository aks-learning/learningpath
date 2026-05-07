---
sidebar_position: 5
title: "Service Mesh: Você Precisa de Um?"
description: "Você provavelmente não precisa de um service mesh. Comece sem. Aqui está como decidir, e o que usar se você genuinamente precisar."
---

# Service mesh: você precisa de um?

Você provavelmente não precisa de um service mesh. Comece sem.

Service meshes adicionam complexidade operacional, aumentam o consumo de recursos (sidecar proxies em cada pod) e resolvem problemas que a maioria dos times não tem de verdade. Antes de recorrer ao Istio, pergunte a si mesmo: network policies + roteamento de ingress resolvem isso?

## O framework de decisão

| Você precisa de... | Sem mesh | Com mesh |
|--------------------|----------|----------|
| Criptografia pod-a-pod (mTLS) | Network policies + pod identity | mTLS automático em todos os lugares |
| Traffic splitting (canary) | Canary no nível de ingress (Flagger, AGC) | Traffic splitting L7 por serviço |
| Policies de retry/timeout | No nível da aplicação (SDK) | No nível do sidecar (transparente) |
| Circuit breaking | No nível da aplicação | No nível do sidecar |
| Distributed tracing | SDK OpenTelemetry na sua app | Geração automática de spans |
| Comunicação cross-cluster | Configuração manual | Multi-cluster integrado |
| Observabilidade L7 (métricas HTTP) | Instrumentação da aplicação | Automático a partir dos sidecars |

:::tip

Network policies (Cilium) + retries no nível da aplicação + OpenTelemetry cobrem 80% do que os times acham que precisam de um mesh. Só adicione um mesh quando você genuinamente precisar de mTLS transparente entre todos os serviços ou gerenciamento avançado de tráfego L7 que não pode ser feito na camada de ingress.
:::

## Quando você PRECISA de um service mesh

**Requisitos de networking zero-trust**: Compliance exige que toda chamada serviço-a-serviço seja criptografada e mutuamente autenticada. Network policies controlam quem pode conectar (L3/L4), mas um mesh adiciona identidade L7 e criptografia.

**Canary deployments no nível do serviço**: Você precisa enviar 5% do tráfego para a v2 de um serviço interno (não apenas no limite do ingress). Isso é traffic splitting L7 de verdade.

**Comunicação cross-cluster de serviços**: Serviços no Cluster A precisam chamar serviços no Cluster B de forma transparente com balanceamento de carga, retries e mTLS.

**Trilha de auditoria regulatória**: Você precisa de logs de acesso por requisição entre serviços para compliance, sem modificar o código da aplicação.

## Quando você NÃO precisa de um service mesh

- Você tem menos de 20 serviços -- o overhead não compensa
- Seus serviços já lidam com retries e timeouts (a maioria dos frameworks modernos faz isso)
- Você só precisa de criptografia em trânsito -- considere TLS no nível do pod
- Você só precisa de traffic splitting na borda -- use AGC ou App Routing
- Você quer "observabilidade" -- use OpenTelemetry, não um mesh

## O add-on de service mesh baseado em Istio

Se você realmente precisa de um mesh, use o add-on Istio gerenciado pelo AKS. Não gerencie Istio sozinho -- é operacionalmente caro.

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

Habilite injeção de sidecar por namespace:

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
- Integrado com Azure Monitor para métricas
- Upgrades canary do próprio mesh baseados em revisão
- Sem gerenciamento de Helm chart, sem upgrades manuais de CRDs

## Alternativas a um mesh completo

### Cilium service mesh (mais leve)

Se você já roda Cilium (e deveria -- veja [Comparação de CNI](./cni-comparison)), você ganha capacidades básicas de mesh sem sidecars:

- **mTLS** via criptografia baseada em identidade do Cilium (WireGuard ou IPsec no nível do node)
- **Policies L7** via integração Cilium Envoy (sem sidecar por pod)
- **Hubble** para observabilidade L7

Isso não é um service mesh completo, mas cobre a lacuna de criptografia e observabilidade para muitos times sem o custo de sidecars.

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

### Linkerd (não gerenciado pelo AKS)

Linkerd é mais leve que Istio, mas não é oferecido como add-on gerenciado do AKS. Você é responsável pelo ciclo de vida. Use apenas se tiver forte experiência com Linkerd e precisar do proxy baseado em Rust (menor consumo de recursos que o Envoy).

:::warning

Se você escolher um mesh não gerenciado (Linkerd, Istio autogerenciado, Consul Connect), o suporte da Microsoft não pode ajudar a debugar problemas de rede relacionados ao mesh. A responsabilidade é inteiramente sua.
:::

## Impacto em recursos

Um service mesh não é de graça. Planeje para:

| Componente | Custo de Recursos |
|-----------|-------------------|
| Control plane do Istio (istiod) | ~500m CPU, ~1Gi RAM por réplica |
| Sidecar proxy (por pod) | ~100m CPU, ~128Mi RAM baseline |
| Overhead de sidecar em cluster de 100 pods | ~10 CPU cores, ~12Gi RAM |

Para um cluster de 100 pods, o custo de sidecars é de aproximadamente 10 CPU cores adicionais e 12 GiB de RAM. Isso é significativo. Certifique-se de que o valor justifique o custo.

## Erros comuns

1. **Adicionar um mesh "porque a Netflix usa um"** -- A Netflix tem milhares de serviços. Você tem 12. Network policies resolvem.
2. **Autogerenciar Istio** -- Upgrades do Istio são notoriamente dolorosos. Use o add-on gerenciado ou não use Istio.
3. **Habilitar injeção de sidecar em todo o cluster** -- Comece com um namespace. Depure problemas isoladamente antes de expandir.
4. **Ignorar overhead de recursos** -- O custo de memória dos sidecars se acumula. Um deployment de 100 pods de repente precisa de 12Gi a mais de RAM.
5. **Usar um mesh apenas para criptografia** -- Se você só precisa de criptografia em trânsito, considere criptografia WireGuard do Cilium (no nível do node, sem sidecars) ou TLS no nível do pod.
6. **Não treinar o time** -- Um mesh adiciona Envoy, VirtualServices, DestinationRules, PeerAuthentication e AuthorizationPolicy a sua superfície operacional. Reserve tempo para aprendizado.

## Checklist de decisão

Antes de habilitar um service mesh, responda sim para pelo menos duas:

- [ ] Você tem mais de 20 serviços se comunicando internamente?
- [ ] mTLS entre todos os serviços é um requisito rígido de compliance?
- [ ] Você precisa de traffic splitting por serviço (não apenas no ingress)?
- [ ] Você precisa de retries/timeouts automáticos sem alterações na aplicação?
- [ ] Você opera em uma topologia multi-cluster?

Se você marcou zero ou uma: use Cilium network policies e pronto.

## Recursos

- [Istio-based Service Mesh Add-on](https://learn.microsoft.com/en-us/azure/aks/istio-about)
- [Enable Istio Add-on](https://learn.microsoft.com/en-us/azure/aks/istio-deploy-addon)
- [Cilium Service Mesh](https://docs.cilium.io/en/stable/network/servicemesh/)
- [AKS Network Policies with Cilium](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [AKS Labs](https://azure-samples.github.io/aks-labs)

---

**Anterior**: [Clusters Privados](./private-clusters)
