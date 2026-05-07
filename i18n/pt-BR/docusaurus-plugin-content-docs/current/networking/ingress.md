---
sidebar_position: 3
title: "Ingress e Balanceamento de Carga"
description: "Use App Routing para workloads padrão. Use AGC para WAF corporativo. Não gerencie NGINX manualmente a menos que tenha requisitos exoticos."
---

# Ingress e balanceamento de carga

Você tem três opções reais para ingress L7 no AKS: o add-on App Routing (NGINX gerenciado), Application Gateway for Containers (AGC) ou NGINX autogerenciado. Escolha um e comprometa-se.

## A decisão

| Requisito | Use Isto |
|-----------|----------|
| Web apps padrão, APIs, terminação TLS | **Add-on App Routing** |
| Corporativo: WAF, traffic splitting avançado, Gateway API | **Application Gateway for Containers (AGC)** |
| Configuração exótica de NGINX, plugins Lua customizados, controle total | **NGINX autogerenciado** |
| TCP/UDP puro sem roteamento HTTP | **Service LoadBalancer** (pule o ingress completamente) |

:::tip

Use App Routing para workloads padrão. Use AGC para cenários corporativos com necessidade de WAF. Não gerencie NGINX manualmente a menos que precise de configuração exótica que o add-on gerenciado não consiga fornecer.
:::

## Add-on App Routing (NGINX gerenciado)

Esta é a escolha padrão. A Microsoft gerencia o ciclo de vida do ingress controller NGINX, upgrades e escalonamento. Você escreve recursos Ingress, ele cuida do resto.

```bash
# Enable App Routing on an existing cluster
az aks approuting enable --resource-group myrg --name myaks

# With Azure DNS integration and Key Vault for certs
az aks approuting enable \
  --resource-group myrg \
  --name myaks \
  --enable-kv \
  --attach-kv /subscriptions/.../vaults/my-kv
```

```yaml
# Standard Ingress with App Routing
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: webapprouting.kubernetes.azure.com
  tls:
    - hosts:
        - myapp.example.com
      secretName: myapp-tls
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-app-svc
                port:
                  number: 80
```

O App Routing oferece:
- Ciclo de vida gerenciado do NGINX (sem ficar babando Helm chart)
- Integração nativa com Azure DNS zone
- Integração com Key Vault para certificados TLS
- Multiplas instâncias de ingress controller (interno + externo)
- Métricas Prometheus prontas para uso

## Application Gateway for Containers (AGC)

AGC é o sucessor do AGIC (Application Gateway Ingress Controller). É nativo da Kubernetes Gateway API, não do Ingress legado. Use quando precisar de WAF, gerenciamento avançado de tráfego ou balanceamento de carga L7 nativo do Azure em escala.

```yaml
# Gateway API: Gateway resource (AGC-backed)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  annotations:
    alb.networking.azure.io/alb-id: /subscriptions/.../applicationGateways/my-agc
spec:
  gatewayClassName: azure-alb-external
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: my-cert
---
# HTTPRoute for traffic routing
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-app-route
spec:
  parentRefs:
    - name: my-gateway
  hostnames:
    - "myapp.example.com"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-service
          port: 8080
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: frontend-service
          port: 3000
```

:::info

O AGC usa a Kubernetes Gateway API (Gateway, HTTPRoute, GRPCRoute), não o recurso Ingress legado. Esta é a direção futura do gerenciamento de tráfego no Kubernetes. Se você está começando do zero, prefira a Gateway API.
:::

## Load balancers internos vs externos

Para services L4 (TCP/UDP) ou exposição somente interna:

```yaml
# Internal Load Balancer -- not internet-facing
apiVersion: v1
kind: Service
metadata:
  name: internal-api
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-internal: "true"
    service.beta.kubernetes.io/azure-load-balancer-internal-subnet: "internal-subnet"
spec:
  type: LoadBalancer
  ports:
    - port: 443
      targetPort: 8443
  selector:
    app: internal-api
---
# External Load Balancer with static IP
apiVersion: v1
kind: Service
metadata:
  name: public-api
  annotations:
    service.beta.kubernetes.io/azure-load-balancer-resource-group: "pip-rg"
spec:
  type: LoadBalancer
  loadBalancerIP: 20.1.2.3  # Pre-created Public IP
  ports:
    - port: 443
      targetPort: 8443
  selector:
    app: public-api
```

## TLS e gerenciamento de certificados

Use cert-manager com Let's Encrypt para ciclo de vida automatizado de certificados. Não gerencie certificados manualmente.

```yaml
# ClusterIssuer for Let's Encrypt
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform-team@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            ingressClassName: webapprouting.kubernetes.azure.com
```

Para certificados gerenciados pelo Azure Key Vault (corporativo):

```bash
# App Routing pulls certs from Key Vault automatically
az aks approuting update \
  --resource-group myrg \
  --name myaks \
  --enable-kv \
  --attach-kv /subscriptions/.../vaults/prod-kv
```

## Erros comuns

1. **Autogerenciar NGINX "para ter controle"** -- Você herda a carga de upgrades, patches de CVE e tuning de HPA. O App Routing cuida de tudo isso.
2. **Usar AGIC (v1) para projetos novos** -- AGIC é legado. AGC com Gateway API é o substituto.
3. **Esquecer ingress interno** -- A maioria das aplicações precisa de ingress controllers tanto externo (público) quanto interno (privado). O App Routing suporta múltiplas instâncias.
4. **Fixar IPs de LoadBalancer no código** -- Use external-dns com Azure DNS zones para gerenciamento automático de registros DNS.
5. **Não aplicar rate limiting no ingress** -- Um único cliente mal-comportado pode saturar seu ingress controller. Configure annotations de rate limiting.

:::warning

Nunca exponha Services como `type: LoadBalancer` com IP público sem um plano de WAF ou proteção contra DDoS. Use AGC com policies de WAF para workloads voltados para a internet que processam entrada de usuários.
:::

## Recursos

- [App Routing Add-on](https://learn.microsoft.com/en-us/azure/aks/app-routing)
- [Application Gateway for Containers](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview)
- [Gateway API on AKS](https://learn.microsoft.com/en-us/azure/aks/gateway-api)
- [Internal Load Balancer](https://learn.microsoft.com/en-us/azure/aks/internal-lb)
- [cert-manager on AKS](https://learn.microsoft.com/en-us/azure/aks/certificate-management)
- [AKS Labs](https://azure-samples.github.io/aks-labs)

---

**Próximo**: [Clusters Privados](./private-clusters) -- proteja seu API server.
