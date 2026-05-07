---
sidebar_position: 3
title: "Ingress e Balanceamento de Carga"
description: "Use App Routing para workloads padrao. Use AGC para WAF corporativo. Nao gerencie NGINX manualmente a menos que tenha requisitos exoticos."
---

# Ingress e Balanceamento de Carga

Voce tem tres opcoes reais para ingress L7 no AKS: o add-on App Routing (NGINX gerenciado), Application Gateway for Containers (AGC) ou NGINX autogerenciado. Escolha um e comprometa-se.

## A Decisao

| Requisito | Use Isto |
|-----------|----------|
| Web apps padrao, APIs, terminacao TLS | **Add-on App Routing** |
| Corporativo: WAF, traffic splitting avancado, Gateway API | **Application Gateway for Containers (AGC)** |
| Configuracao exotica de NGINX, plugins Lua customizados, controle total | **NGINX autogerenciado** |
| TCP/UDP puro sem roteamento HTTP | **Service LoadBalancer** (pule o ingress completamente) |

:::tip

Use App Routing para workloads padrao. Use AGC para cenarios corporativos com necessidade de WAF. Nao gerencie NGINX manualmente a menos que precise de configuracao exotica que o add-on gerenciado nao consiga fornecer.
:::

## Add-on App Routing (NGINX Gerenciado)

Esta e a escolha padrao. A Microsoft gerencia o ciclo de vida do ingress controller NGINX, upgrades e escalonamento. Voce escreve recursos Ingress, ele cuida do resto.

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
- Integracao nativa com Azure DNS zone
- Integracao com Key Vault para certificados TLS
- Multiplas instancias de ingress controller (interno + externo)
- Metricas Prometheus prontas para uso

## Application Gateway for Containers (AGC)

AGC e o sucessor do AGIC (Application Gateway Ingress Controller). E nativo da Kubernetes Gateway API, nao do Ingress legado. Use quando precisar de WAF, gerenciamento avancado de trafego ou balanceamento de carga L7 nativo do Azure em escala.

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

O AGC usa a Kubernetes Gateway API (Gateway, HTTPRoute, GRPCRoute), nao o recurso Ingress legado. Esta e a direcao futura do gerenciamento de trafego no Kubernetes. Se voce esta comecando do zero, prefira a Gateway API.
:::

## Load Balancers Internos vs Externos

Para services L4 (TCP/UDP) ou exposicao somente interna:

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

## TLS e Gerenciamento de Certificados

Use cert-manager com Let's Encrypt para ciclo de vida automatizado de certificados. Nao gerencie certificados manualmente.

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

## Erros Comuns

1. **Autogerenciar NGINX "para ter controle"** -- Voce herda a carga de upgrades, patches de CVE e tuning de HPA. O App Routing cuida de tudo isso.
2. **Usar AGIC (v1) para projetos novos** -- AGIC e legado. AGC com Gateway API e o substituto.
3. **Esquecer ingress interno** -- A maioria das aplicacoes precisa de ingress controllers tanto externo (publico) quanto interno (privado). O App Routing suporta multiplas instancias.
4. **Fixar IPs de LoadBalancer no codigo** -- Use external-dns com Azure DNS zones para gerenciamento automatico de registros DNS.
5. **Nao aplicar rate limiting no ingress** -- Um unico cliente mal-comportado pode saturar seu ingress controller. Configure annotations de rate limiting.

:::warning

Nunca exponha Services como `type: LoadBalancer` com IP publico sem um plano de WAF ou protecao contra DDoS. Use AGC com policies de WAF para workloads voltados para a internet que processam entrada de usuarios.
:::

## Recursos

- [App Routing Add-on](https://learn.microsoft.com/en-us/azure/aks/app-routing)
- [Application Gateway for Containers](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview)
- [Gateway API on AKS](https://learn.microsoft.com/en-us/azure/aks/gateway-api)
- [Internal Load Balancer](https://learn.microsoft.com/en-us/azure/aks/internal-lb)
- [cert-manager on AKS](https://learn.microsoft.com/en-us/azure/aks/certificate-management)
- [AKS Labs](https://azure-samples.github.io/aks-labs)

---

**Proximo**: [Clusters Privados](./private-clusters) -- proteja seu API server.
