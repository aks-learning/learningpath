---
sidebar_position: 3
title: "Extensões da plataforma"
description: "Ferramentas essenciais do ecossistema Kubernetes para AKS: Dapr, cert-manager, external-dns, External Secrets Operator, Gateway API e OpenTelemetry."
---

# Extensões da plataforma

Um cluster AKS de produção precisa de mais do que apenas Kubernetes. Estas são as ferramentas do ecossistema que preenchem as lacunas entre o que o Kubernetes oferece e o que as cargas de trabalho de produção realmente precisam.

## cert-manager

Gerenciamento automatizado do ciclo de vida de certificados TLS. Ele monitora recursos Ingress e Gateway, solicita certificados de emissores como Let's Encrypt ou Azure Key Vault e os renova antes da expiração. O gerenciamento manual de certificados não escala — um renovação esquecida derruba a produção às 2 da manhã.

### Instalação

```bash
helm repo add jetstack https://charts.jetstack.io --force-update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true
```

### Configuração recomendada

Use um `ClusterIssuer` em vez de recursos `Issuer` com escopo de namespace. Um único issuer atende todos os namespaces.

```yaml
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
            class: nginx
```

:::warning

Não use o issuer staging do Let's Encrypt em produção "apenas para testar". Certificados staging não são confiáveis pelos navegadores e causarão falhas silenciosas em health checks e ferramentas de monitoramento.

:::

### Erros comuns

| Erro | Impacto | Correção |
|---|---|---|
| `Issuer` com escopo de namespace por equipe | Configuração duplicada, renovação inconsistente | Use `ClusterIssuer` |
| RBAC ausente para desafios DNS-01 | Emissão de certificado falha silenciosamente | Conceda à identidade do cert-manager a role `DNS Zone Contributor` na sua zona Azure DNS |
| Não monitorar expiração de certificados | Interrupções por certificados expirados | Adicione um alerta Prometheus em `certmanager_certificate_expiration_timestamp_seconds` |

## external-dns

Cria e atualiza automaticamente registros DNS no Azure DNS quando você cria recursos Ingress ou Service. Se o seu processo envolve abrir o portal Azure para adicionar um registro A, você tem uma lacuna no seu pipeline GitOps.

### Instalação

```bash
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns
helm install external-dns external-dns/external-dns \
  --namespace external-dns --create-namespace \
  --set provider.name=azure \
  --set azure.resourceGroup=<YOUR_DNS_RG> \
  --set azure.subscriptionId=<YOUR_SUB_ID> \
  --set azure.tenantId=<YOUR_TENANT_ID> \
  --set policy=upsert-only \
  --set registry=txt --set txtOwnerId=aks-cluster-01
```

:::tip

Defina `policy=upsert-only` em produção. A política padrão `sync` exclui registros DNS que não são mais respaldados por um recurso Kubernetes, o que pode apagar registros gerenciados fora do cluster.

:::

### Configuração recomendada

Use workload identity para autenticação:

```bash
az role assignment create \
  --assignee-object-id <EXTERNAL_DNS_MI_OBJECT_ID> \
  --role "DNS Zone Contributor" \
  --scope /subscriptions/<SUB_ID>/resourceGroups/<RG>/providers/Microsoft.Network/dnsZones/<ZONE>
```

### Erros comuns

| Erro | Impacto | Correção |
|---|---|---|
| Usar política `sync` com zonas DNS compartilhadas | Exclui registros de outros sistemas | Use `upsert-only` e defina um `txtOwnerId` único |
| Executar múltiplas instâncias sem owner IDs | Atualizações conflitantes, registros oscilantes | Cada cluster recebe seu próprio `txtOwnerId` |
| Esquecer `--txt-prefix` | Registros TXT de propriedade colidem com registros TXT reais | Defina `--txt-prefix=extdns-` |

## External Secrets Operator

Sincroniza segredos do Azure Key Vault em objetos Kubernetes `Secret`. Use ESO em vez do driver CSI do Azure Key Vault para a maioria das cargas de trabalho — ESO suporta templating, rotação automática e funciona com qualquer pod sem exigir montagens de volume CSI.

### Instalação

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace \
  --set installCRDs=true
```

### Configuração recomendada

Crie um `ClusterSecretStore` com workload identity:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: azure-keyvault
spec:
  provider:
    azurekv:
      authType: WorkloadIdentity
      vaultUrl: https://my-vault.vault.azure.net
      serviceAccountRef:
        name: external-secrets-sa
        namespace: external-secrets
```

Em seguida, declare segredos por namespace:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: azure-keyvault
    kind: ClusterSecretStore
  target:
    name: app-secrets
  data:
    - secretKey: db-password
      remoteRef:
        key: my-app-db-password
```

:::info

O driver CSI Secrets Store monta segredos como arquivos e exige que cada pod declare um volume. O External Secrets Operator cria Secrets Kubernetes padrão que funcionam com `envFrom`, `env` e montagens de volume sem nenhuma alteração na spec do pod. Prefira ESO a menos que você precise especificamente de injeção de segredos baseada em arquivos.

:::

### Erros comuns

| Erro | Impacto | Correção |
|---|---|---|
| Definir `refreshInterval` como `0` | Segredos nunca são rotacionados após a sincronização inicial | Use `1h` ou menor para credenciais sensíveis |
| Um `SecretStore` por namespace | Configuração duplicada do Key Vault entre namespaces | Use `ClusterSecretStore` |
| Não definir `target.creationPolicy: Owner` | Secrets Kubernetes órfãos após exclusão do `ExternalSecret` | Defina `creationPolicy: Owner` para coleta automática de lixo dos segredos |

## Dapr

Dapr fornece blocos de construção para microsserviços: invocação de serviços, pub/sub, gerenciamento de estado e bindings. Se você está construindo serviços que publicam eventos ou gerenciam estado, Dapr abstrai a infraestrutura para que seu código não se acople a um broker ou store específico.

### Instalação

Use a extensão AKS, não o Helm. A extensão AKS é gerenciada pela Microsoft, lida com atualizações e integra-se com o suporte Azure.

```bash
az k8s-extension create \
  --cluster-type managedClusters \
  --cluster-name <CLUSTER_NAME> \
  --resource-group <RG> \
  --name dapr \
  --extension-type Microsoft.Dapr \
  --auto-upgrade-minor-version true
```

:::warning

Não instale Dapr via Helm no AKS. A extensão AKS fornece gerenciamento de ciclo de vida, integração de monitoramento e cobertura de suporte que uma instalação via Helm não fornece.

:::

### Configuração recomendada

Habilite Dapr adicionando annotations na spec do pod:

```yaml
annotations:
  dapr.io/enabled: "true"
  dapr.io/app-id: "order-service"
  dapr.io/app-port: "8080"
  dapr.io/log-level: "info"
```

### Erros comuns

| Erro | Impacto | Correção |
|---|---|---|
| Instalar Dapr via Helm no AKS | Sem cobertura de suporte, atualizações manuais | Use a extensão AKS |
| Habilitar Dapr em cada pod | Overhead desnecessário de sidecar para serviços simples | Anote apenas pods que usam blocos de construção Dapr |
| Pular configuração mTLS | Tráfego entre serviços não criptografado | Dapr habilita mTLS por padrão; não desabilite |

## Gateway API

Gateway API é o sucessor do recurso Ingress. Ele fornece uma API padrão e orientada a funções para roteamento de tráfego L4/L7 com suporte a divisão de tráfego, roteamento baseado em headers e referências entre namespaces. Use-o em vez do Ingress para novas cargas de trabalho.

### Instalação

No AKS, use o Application Gateway for Containers (AGC) como implementação da Gateway API:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml
```

### Configuração recomendada

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: main-gateway
  namespace: gateway-infra
spec:
  gatewayClassName: azure-alb-external
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        certificateRefs:
          - name: wildcard-cert
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-route
spec:
  parentRefs:
    - name: main-gateway
      namespace: gateway-infra
  hostnames: ["app.example.com"]
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - name: app-service
          port: 80
```

:::tip

Defina o recurso `Gateway` em um namespace de infraestrutura de propriedade da equipe de plataforma. As equipes de aplicação criam recursos `HTTPRoute` em seus próprios namespaces com `parentRefs` apontando para o gateway compartilhado. Isso reforça a separação de responsabilidades.

:::

### Erros comuns

| Erro | Impacto | Correção |
|---|---|---|
| Usar Ingress quando Gateway API está disponível | Preso a configuração baseada em annotations, roteamento limitado | Migre para Gateway API para novas cargas de trabalho |
| Um Gateway por aplicação | Recursos de load balancer desperdiçados, custo maior | Compartilhe um Gateway entre aplicações usando HTTPRoute |
| `ReferenceGrant` ausente para referências entre namespaces | Routes falham silenciosamente ao anexar | Crie `ReferenceGrant` no namespace de destino |

## OpenTelemetry collector

Um pipeline de telemetria agnóstico de fornecedor que recebe, processa e exporta traces, métricas e logs. Instrumente uma vez com SDKs OpenTelemetry, depois roteie para Azure Monitor, Prometheus ou qualquer backend compatível com OTLP sem alterar o código da aplicação.

### Instalação

```bash
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm install otel-collector open-telemetry/opentelemetry-collector \
  --namespace otel --create-namespace \
  --set mode=deployment
```

### Configuração recomendada

Use o modo DaemonSet para coleta de logs e métricas, modo Deployment para agregação de traces:

```yaml
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: otel
  namespace: otel
spec:
  mode: daemonset
  config:
    receivers:
      otlp:
        protocols:
          grpc: { endpoint: 0.0.0.0:4317 }
          http: { endpoint: 0.0.0.0:4318 }
    processors:
      batch:
        timeout: 5s
        send_batch_size: 1024
      memory_limiter:
        check_interval: 1s
        limit_mib: 512
    exporters:
      otlp:
        endpoint: "azure-monitor-endpoint:443"
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [memory_limiter, batch]
          exporters: [otlp]
        metrics:
          receivers: [otlp]
          processors: [memory_limiter, batch]
          exporters: [otlp]
```

:::warning

Sempre configure o processador `memory_limiter`. Sem ele, uma rajada de dados de telemetria pode causar OOM-kill no pod do collector e criar uma lacuna no seu pipeline de observabilidade.

:::

### Erros comuns

| Erro | Impacto | Correção |
|---|---|---|
| Pular o processador `memory_limiter` | Collector sofre OOM sob carga | Adicione `memory_limiter` como o primeiro processador em cada pipeline |
| Executar apenas no modo Deployment | Perde métricas e logs a nível de nó | Use DaemonSet para coleta, Deployment para agregação |
| Exportar tudo sem amostragem | Custo alto, acúmulo de armazenamento | Configure tail sampling para traces em 10-20% em ambientes de não-produção |

## Kyverno

Um mecanismo de políticas para Kubernetes que usa YAML em vez de Rego (OPA Gatekeeper). Kyverno valida, altera, gera e limpa recursos. Use Kyverno em vez do OPA Gatekeeper a menos que sua organização já tenha investimento em Rego.

### Instalação

```bash
helm repo add kyverno https://kyverno.github.io/kyverno
helm install kyverno kyverno/kyverno \
  --namespace kyverno --create-namespace \
  --set replicaCount=3
```

### Configuração recomendada

Comece com o modo `Audit`, depois mude para `Enforce` quando confirmar que as políticas não quebram cargas de trabalho existentes:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resource-limits
spec:
  validationFailureAction: Audit
  rules:
    - name: check-limits
      match:
        any:
          - resources:
              kinds: [Pod]
      validate:
        message: "CPU and memory limits are required."
        pattern:
          spec:
            containers:
              - resources:
                  limits:
                    memory: "?*"
                    cpu: "?*"
```

:::info

Use Kyverno em vez do OPA Gatekeeper a menos que sua organização já tenha investimento em Rego. As políticas Kyverno são mais fáceis de escrever, revisar em PRs e depurar. As capacidades de mutação e geração também reduzem boilerplate entre namespaces.

:::

### Erros comuns

| Erro | Impacto | Correção |
|---|---|---|
| Começar com modo `Enforce` | Bloqueia cargas de trabalho existentes que violam políticas | Comece com `Audit`, revise violações, depois mude para `Enforce` |
| Não excluir namespaces do sistema | Políticas bloqueiam componentes do kube-system | Adicione regras `exclude` para `kube-system`, `cert-manager` e outros namespaces de plataforma |
| Muitas políticas de mutação | Difícil depurar por que um recurso está diferente do manifesto | Documente mutações e mantenha-as mínimas |

## De quais extensões você precisa?

Nem todo cluster precisa de todas as extensões. Use esta tabela para escolher o conjunto certo para o seu tipo de carga de trabalho.

| Extensão | Web app | Microsserviços | Event-driven | ML/batch |
|---|---|---|---|---|
| cert-manager | Obrigatório | Obrigatório | Recomendado | Opcional |
| external-dns | Obrigatório | Obrigatório | Recomendado | Opcional |
| External Secrets Operator | Obrigatório | Obrigatório | Obrigatório | Obrigatório |
| Dapr | Opcional | Obrigatório | Obrigatório | Não necessário |
| Gateway API | Obrigatório | Obrigatório | Opcional | Não necessário |
| OpenTelemetry Collector | Obrigatório | Obrigatório | Obrigatório | Recomendado |
| Kyverno | Obrigatório | Obrigatório | Obrigatório | Obrigatório |

## Anti-padrões

**Instalar tudo no primeiro dia.** Comece com o que você precisa. Cada extensão adiciona CRDs, pods e carga de atualização. Adicione extensões quando tiver um caso de uso concreto.

**Usar Helm quando existe um add-on AKS.** O AKS fornece versões gerenciadas de Dapr, KEDA, Flux e outros. Estes se integram com o suporte Azure e atualizam automaticamente. Verifique antes de recorrer ao Helm:

```bash
az k8s-extension list --cluster-type managedClusters \
  --cluster-name <CLUSTER_NAME> --resource-group <RG> -o table
```

**Executar extensões sem limites de recursos.** Cada extensão executa pods no seu cluster. Defina requests e limits em todas as cargas de trabalho de extensão para evitar esgotamento de recursos.

**RBAC com escopo excessivo.** Use workload identity com a role mais restrita possível. Não atribua `Contributor` no nível da assinatura quando `DNS Zone Contributor` em uma única zona é suficiente.

## Recursos

- [Visão geral das extensões AKS](https://learn.microsoft.com/azure/aks/cluster-extensions)
- [cert-manager no AKS](https://learn.microsoft.com/azure/aks/certificate-management)
- [External DNS com Azure DNS](https://learn.microsoft.com/azure/aks/workload-identity-deploy-cluster#configure-external-dns)
- [External Secrets Operator com Key Vault](https://external-secrets.io/latest/provider/azure-key-vault/)
- [Extensão Dapr para AKS](https://learn.microsoft.com/azure/aks/dapr)
- [Gateway API no AKS com AGC](https://learn.microsoft.com/azure/application-gateway/for-containers/overview)
- [OpenTelemetry com Azure Monitor](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-enable)
- [Documentação do Kyverno](https://kyverno.io/docs/)
- [Workload identity no AKS](https://learn.microsoft.com/azure/aks/workload-identity-overview)
