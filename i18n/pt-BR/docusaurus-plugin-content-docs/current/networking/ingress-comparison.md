---
sidebar_position: 6
title: "Comparação de ingress"
description: "Comparação direta entre NGINX (App Routing), Application Gateway for Containers, NGINX autogerenciado e Gateway API para ingress no AKS."
---

# Comparação de ingress

Existem quatro opções de ingress no AKS. Esta página compara todas lado a lado para que você possa escolher uma e seguir em frente.

## Comparação completa

| Recurso | App Routing (managed NGINX) | AGC (Application Gateway for Containers) | NGINX autogerenciado | Gateway API (preview) |
|---------|----------------------------|------------------------------------------|--------------------|-----------------------|
| **Gerenciado por** | Microsoft | Microsoft | Você | Você (com ALB controller) |
| **Modelo de API** | Ingress resource | Gateway API (Gateway, HTTPRoute) | Ingress resource | Gateway API |
| **Terminação TLS** | Sim (Key Vault, cert-manager) | Sim (Key Vault, certificados gerenciados) | Sim (manual ou cert-manager) | Sim |
| **WAF** | Não | Sim (Azure WAF v2) | ModSecurity (autogerenciado) | Não |
| **mTLS** | Annotations (parcial) | Nativo | Controle total | Nativo |
| **Suporte a Gateway API** | Não | Sim (nativo) | Contribuição da comunidade | Sim (por definição) |
| **Divisão de tráfego** | Annotations (canary) | HTTPRoute weights | Annotations (canary) | HTTPRoute weights |
| **Configuração personalizada** | Annotations limitadas | Políticas do Azure | Ilimitada (nginx.conf) | Baseada em CRD |
| **Scale to zero** | Não | Não | Não | Não |
| **Interno + externo** | Sim (múltiplas instâncias) | Sim (Gateways separados) | Sim (deployments separados) | Sim |
| **Atualizações** | Automáticas | Automáticas | Helm upgrades manuais | Manual |
| **Custo** | Gratuito (computação nos seus nós) | Pago por uso (recurso Azure) | Gratuito (computação nos seus nós) | Gratuito (computação nos seus nós) |
| **Complexidade** | Baixa | Média | Alta | Média |
| **Prontidão para produção** | GA | GA | Depende de você | Preview |

## Árvore de decisão

Comece aqui e siga o caminho:

```
Do you need a WAF in front of your cluster?
├── Yes → Use AGC (Application Gateway for Containers)
│         It is the only option with Azure WAF v2 integrated.
│
└── No → Do you need Gateway API, advanced traffic policies, or header-based routing?
          ├── Yes → Do you need it in production today?
          │         ├── Yes → Use AGC (GA with Gateway API)
          │         └── No  → Evaluate Gateway API (preview) for future-proofing
          │
          └── No → Do you need custom NGINX modules, Lua plugins, or exotic config?
                    ├── Yes → Self-managed NGINX (accept the ops burden)
                    └── No  → Use App Routing (managed NGINX)
```

:::tip

Use App Routing como padrão. Ele cobre 80% das cargas de trabalho sem nenhuma sobrecarga operacional. Atualize para AGC quando o negócio exigir WAF ou quando você precisar de Gateway API em produção.

:::

## Quando usar cada opção

### App Routing: o padrão

Use App Routing quando precisar de ingress L7 padrão com terminação TLS, roteamento baseado em caminho e roteamento baseado em host. Isso cobre a maioria dos aplicativos web e APIs.

```bash
# Enable App Routing with Key Vault integration
az aks approuting enable \
  --resource-group myrg \
  --name myaks \
  --enable-kv \
  --attach-kv /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.KeyVault/vaults/<vault>
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-api
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  ingressClassName: webapprouting.kubernetes.azure.com
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-svc
                port:
                  number: 80
```

### AGC: enterprise e WAF

Use AGC quando precisar de proteção WAF, Gateway API, divisão de tráfego ponderada ou balanceamento de carga L7 nativo do Azure que vive fora do seu cluster.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: prod-gateway
  annotations:
    alb.networking.azure.io/alb-id: /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ServiceNetworking/trafficControllers/<name>
spec:
  gatewayClassName: azure-alb-external
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: prod-cert
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: canary-route
spec:
  parentRefs:
    - name: prod-gateway
  hostnames:
    - "app.example.com"
  rules:
    - backendRefs:
        - name: app-stable
          port: 80
          weight: 90
        - name: app-canary
          port: 80
          weight: 10
```

### NGINX autogerenciado: apenas quando necessário

Use NGINX autogerenciado apenas quando precisar de recursos que o App Routing não expõe: scripts Lua personalizados, módulos OpenResty ou uma versão específica do NGINX fixada para conformidade.

```bash
# Install via Helm -- you own upgrades, CVE patches, and HPA tuning
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.replicaCount=3 \
  --set controller.nodeSelector."kubernetes\.io/os"=linux \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"="/healthz"
```

:::warning

Autogerenciar o NGINX significa que você é responsável por aplicar patches de CVEs, escalar o controller, lidar com atualizações e depurar falhas. A maioria das equipes subestima essa carga. Use App Routing a menos que tenha um motivo específico e documentado para não fazê-lo.

:::

### Gateway API: o futuro (preview)

Gateway API é o sucessor nativo do Kubernetes para o recurso Ingress. Ele separa as preocupações de infraestrutura (Gateway) do roteamento de aplicações (HTTPRoute), dando às equipes de plataforma e às equipes de aplicação responsabilidades distintas. No AKS, o AGC já suporta Gateway API nativamente. O controller standalone de Gateway API está em preview.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: cluster-gateway
spec:
  gatewayClassName: azure-alb-external
  listeners:
    - name: http
      protocol: HTTP
      port: 80
```

## Caminhos de migração

| De | Para | Caminho |
|------|----|------|
| AGIC (v1) | AGC | Implante o AGC ao lado do AGIC, migre as HTTPRoutes, remova o AGIC. A Microsoft recomenda essa migração. |
| NGINX autogerenciado | App Routing | Habilite o App Routing, atualize o `ingressClassName`, valide o roteamento, remova o Helm release. |
| App Routing | AGC | Implante o AGC, converta recursos Ingress para Gateway + HTTPRoute, mude o DNS, desabilite o App Routing. |
| Qualquer | Gateway API | Implante o controller de Gateway API, crie recursos Gateway + HTTPRoute, mude o tráfego, remova o controller antigo. |

:::info

AGIC (Application Gateway Ingress Controller v1) é legado. Se você ainda está usando AGIC, migre para AGC. A Microsoft declarou que AGC é a substituição e a direção de investimento.

:::

## Anti-padrões

**Executar dois ingress controllers no mesmo cluster sem isolamento.** Se tanto o App Routing quanto o NGINX autogerenciado monitoram os mesmos recursos Ingress, eles entram em conflito na configuração. Use valores distintos de `ingressClassName` e garanta que cada Ingress declare explicitamente qual controller é responsável.

**Misturar AGIC com NGINX.** O AGIC grava regras no Application Gateway. O NGINX roda dentro do cluster. Ter ambos significa dois caminhos de tráfego separados, dois conjuntos de certificados TLS, duas configurações de monitoramento e o dobro da superfície de depuração. Escolha um.

**Usar Services do tipo LoadBalancer para tráfego HTTP.** Cada Service `type: LoadBalancer` cria uma regra no Azure Load Balancer. Dez services significam dez IPs públicos e dez regras de load balancer. Use um ingress controller para consolidar o tráfego HTTP atrás de um único IP.

**Não usar WAF para workloads expostos à internet.** Se seu aplicativo aceita entrada de usuários da internet pública, você precisa de um WAF. App Routing e NGINX autogerenciado não incluem um. Use AGC com Azure WAF ou coloque o Azure Front Door com WAF na frente.

**Não configurar limites de taxa.** Um único cliente agressivo pode saturar seu ingress controller e afetar todos os tenants por trás dele. Sempre configure rate limiting, seja via annotations do NGINX ou políticas do AGC.

## Recursos

- [App Routing add-on](https://learn.microsoft.com/en-us/azure/aks/app-routing)
- [Application Gateway for Containers overview](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview)
- [Migrate from AGIC to AGC](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc)
- [Gateway API on AKS](https://learn.microsoft.com/en-us/azure/aks/gateway-api)
- [NGINX Ingress annotations](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/)
- [Azure WAF on AGC](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/waf-overview)

---

**Próximo**: [Service Mesh](./service-mesh) -- quando ingress não é suficiente e você precisa de observabilidade a nível de mesh e mTLS.
