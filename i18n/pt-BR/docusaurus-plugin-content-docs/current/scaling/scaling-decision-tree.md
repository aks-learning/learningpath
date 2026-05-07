---
sidebar_position: 5
title: "Árvore de decisão de escalabilidade"
description: "Escolha a estratégia certa de autoscaling: HPA, VPA, KEDA, Cluster Autoscaler ou Node Autoprovision. Árvore de decisão para cada tipo de carga de trabalho."
---

# Árvore de decisão de escalabilidade

O AKS possui cinco mecanismos de escalabilidade. Usar o errado (ou a combinação errada) desperdiça dinheiro ou derruba requisições. Esta página indica quais habilitar para cada tipo de carga de trabalho.

## Os cinco escaladores em resumo

| Escalador | O que escala | Gatilho | Scale to zero | Add-on gerenciado |
|--------|---------------|---------|---------------|----------------|
| **HPA** | Réplicas de pods | CPU, memória, métricas customizadas | Não | Integrado (Kubernetes) |
| **VPA** | Requests de recursos dos pods | Uso histórico | Não | Add-on do AKS |
| **KEDA** | Réplicas de pods | Eventos externos (filas, cron, HTTP, Prometheus) | Sim | Add-on do AKS |
| **Cluster Autoscaler (CA)** | Nós em um node pool | Pods não agendáveis / nós subutilizados | Não (min-count >= 1 para system pools) | Integrado |
| **Node Autoprovision (NAP)** | Node pools + nós | Pods não agendáveis (escolhe o VM SKU automaticamente) | Sim (pool inteiro) | AKS Automatic |

:::tip

Autoscalers de pods (HPA, VPA, KEDA) decidem quantos pods você precisa. Autoscalers de nós (CA, NAP) garantem que esses pods tenham onde executar. Sempre combine um autoscaler de pods com um autoscaler de nós.

:::

## Árvore de decisão por tipo de carga de trabalho

### 1. Web APIs e serviços HTTP

Tráfego estável com escalabilidade orientada por requisições. CPU e latência são seus sinais primários.

**Use: HPA (CPU/memória ou métricas customizadas) + Cluster Autoscaler**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-api
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
```

Por que não KEDA? O KEDA adiciona complexidade quando a escalabilidade simples baseada em CPU funciona. Web APIs raramente precisam de scale-to-zero porque lidam com tráfego ao vivo. Reserve o KEDA para cargas de trabalho orientadas a eventos.

### 2. Processadores orientados a eventos e filas

Workers consumindo do Service Bus, Storage Queues, Kafka ou Event Hubs. O tráfego é intermitente e a carga de trabalho deve ficar ociosa quando a fila estiver vazia.

**Use: KEDA + Cluster Autoscaler**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: queue-worker-scaler
spec:
  scaleTargetRef:
    name: queue-worker
  pollingInterval: 15
  cooldownPeriod: 300
  minReplicaCount: 0
  maxReplicaCount: 50
  triggers:
    - type: azure-servicebus
      authenticationRef:
        name: servicebus-workload-identity
      metadata:
        queueName: orders
        messageCount: "5"
```

Por que não HPA? O HPA não consegue escalar para zero. Se seu processador de filas fica ocioso 18 horas por dia, o HPA mantém pelo menos `minReplicas` pods em execução consumindo recursos. O KEDA escala para zero e acorda quando mensagens chegam.

### 3. Batch e cron jobs

Cargas de trabalho agendadas que executam em horários ou intervalos específicos: ETL noturno, geração de relatórios, agregação de dados.

**Use: KEDA (cron trigger) + Cluster Autoscaler com min-count 0 no pool de batch**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: nightly-etl-scaler
spec:
  scaleTargetRef:
    name: etl-worker
  minReplicaCount: 0
  maxReplicaCount: 10
  triggers:
    - type: cron
      metadata:
        timezone: America/Chicago
        start: "0 2 * * *"
        end: "0 5 * * *"
        desiredReplicas: "10"
```

```bash
# Dedicated batch node pool that scales to zero
az aks nodepool add \
  --resource-group myrg \
  --cluster-name myaks \
  --name batch \
  --node-vm-size Standard_D8s_v5 \
  --enable-cluster-autoscaler \
  --min-count 0 \
  --max-count 5 \
  --labels workload=batch \
  --node-taints batch=true:NoSchedule
```

Use taints e tolerations de nós para garantir que os pods de batch sejam alocados no pool de batch. Quando o KEDA escala o deployment para zero, o CA remove os nós de batch ociosos e você não paga nada.

### 4. Inferência AI/ML

Cargas de trabalho GPU com sinais de métricas customizadas (profundidade da fila, latência de requisição, utilização de GPU).

**Use: KEDA ou HPA (métricas customizadas) + Cluster Autoscaler em um node pool GPU**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: inference-scaler
spec:
  scaleTargetRef:
    name: model-server
  minReplicaCount: 1
  maxReplicaCount: 8
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus-server.monitoring.svc:9090
        query: sum(rate(inference_requests_total{service="model-server"}[2m]))
        threshold: "100"
```

```bash
# GPU node pool with autoscaler
az aks nodepool add \
  --resource-group myrg \
  --cluster-name myaks \
  --name gpu \
  --node-vm-size Standard_NC6s_v3 \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 4 \
  --node-taints sku=gpu:NoSchedule \
  --labels workload=gpu
```

:::warning

Nós GPU levam de 5 a 10 minutos para provisionar e ficarem prontos. Não dependa apenas de escalabilidade reativa para inferência sensível à latência. Mantenha o `minReplicaCount` em 1 ou mais para absorver as requisições iniciais enquanto novos nós são iniciados.

:::

### 5. Cargas de trabalho mistas

A maioria dos clusters de produção executa uma combinação de APIs, workers e batch jobs. Separe-os em node pools dedicados e aplique o escalador correto para cada um.

| Carga de trabalho | Node pool | Escalador de pods | Escalador de nós |
|----------|-----------|------------|-------------|
| Web APIs | `general` (D-series) | HPA (CPU) | CA min=2 |
| Queue workers | `general` (D-series) | KEDA (profundidade da fila) | CA min=2 |
| Batch ETL | `batch` (D-series) | KEDA (cron) | CA min=0 |
| Inferência ML | `gpu` (NC-series) | KEDA (Prometheus) | CA min=1 |

Essa separação evita que cargas de trabalho GPU concorram com pods de API por recursos e permite escalar cada pool independentemente.

## Regras de combinação

### Sempre habilite o Cluster Autoscaler junto com os autoscalers de pods

HPA ou KEDA sem CA significa que os pods escalam mas não têm onde executar. Eles ficam em estado Pending até você adicionar nós manualmente. Isso anula o propósito do autoscaling.

```bash
# Every node pool should have CA enabled
az aks nodepool update \
  --resource-group myrg \
  --cluster-name myaks \
  --name general \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 20
```

### VPA e HPA em CPU conflitam -- use VPA apenas para memória com HPA

O VPA ajusta os requests de recursos. O HPA escala com base na utilização de recursos (calculada em relação aos requests). Se ambos visam CPU, eles conflitam: o VPA aumenta os requests, a utilização cai, o HPA reduz. O HPA adiciona réplicas, a utilização cai, o VPA reduz os requests. Esse ciclo nunca se estabiliza.

A combinação segura:

- **HPA**: escala baseado na utilização de CPU
- **VPA**: ajusta apenas os requests de memória (configure o `updatePolicy` para mirar memória, não CPU)

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-api
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
      - containerName: "*"
        controlledResources: ["memory"]
        minAllowed:
          memory: "128Mi"
        maxAllowed:
          memory: "2Gi"
```

:::info

Se você precisa apenas de recomendações de dimensionamento sem alterações automáticas, defina o `updateMode` do VPA como `Off`. Ele ainda coleta dados e mostra recomendações via `kubectl describe vpa`. Use isso para definir seus requests de recursos iniciais.

:::

### KEDA e HPA são complementares, não concorrentes

O KEDA cria recursos HPA internamente quando as réplicas estão acima de zero. Não crie um HPA separado para o mesmo Deployment que o KEDA gerencia -- eles vão conflitar em `desiredReplicas`.

## Erros comuns

**HPA sem Cluster Autoscaler.** O HPA escala pods de 3 para 20. Seu cluster tem capacidade para 12. Os pods 13-20 ficam em Pending. Habilite o CA em todos os node pools.

**KEDA com scale-to-zero mas sem Cluster Autoscaler.** O KEDA escala os pods para zero, mas os nós continuam alocados e gerando custos. O CA é o que remove os nós ociosos. Sem ele, você paga por VMs vazias.

**VPA e HPA ambos visando CPU.** Eles oscilam. O VPA aumenta os requests de CPU, o HPA vê menor utilização e reduz, o VPA diminui os requests, o HPA vê maior utilização e escala. Use VPA apenas para memória quando o HPA estiver ativo.

**maxReplicas definido muito baixo.** Você definiu maxReplicas como 10 "porque deveria ser suficiente." A Black Friday chega, o HPA atinge o teto, requisições começam a falhar. Defina maxReplicas com base na sua estimativa de pico de carga mais 50% de margem.

**Meta de utilização do HPA em 90%.** Quando os pods atingem 90% de CPU, novos pods levam de 30 a 60 segundos para iniciar. Durante essa janela, os pods existentes estão saturados. Mire em 60-70% para deixar margem para picos de tráfego durante o scale-up.

**Não dimensionar corretamente os requests de recursos.** O HPA calcula utilização como `uso real / requests`. Se você solicita 1 CPU mas usa 100m, o HPA vê 10% e nunca escala. Execute o VPA em modo de recomendação primeiro para obter valores de request precisos.

**Esquecer PodDisruptionBudgets.** Quando o CA remove um nó, ele despeja pods. Sem um PDB, todas as réplicas naquele nó podem ser terminadas de uma vez. Sempre defina `minAvailable` ou `maxUnavailable`.

## Dimensionamento correto com VPA em modo de recomendação

Antes de ajustar os targets do HPA, você precisa de requests de recursos precisos. Execute o VPA em modo de recomendação por 24-48 horas em cada carga de trabalho:

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-vpa-recommender
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-api
  updatePolicy:
    updateMode: "Off"
```

```bash
# After 24-48 hours, check recommendations
kubectl describe vpa api-vpa-recommender

# Look for the "Target" values under Container Recommendations
# Use these as your Deployment resource requests
```

Então defina os requests do seu Deployment com os valores recomendados pelo VPA e configure o HPA em torno dessas baselines precisas.

## Anti-padrões

**"Definimos replicas: 10 e nunca mexemos."** Contagens estáticas de réplicas garantem desperdício durante baixo tráfego e falhas durante alto tráfego. Não existe uma contagem de réplicas que esteja correta 24 horas por dia.

**"Usamos KEDA para tudo, até APIs com tráfego estável."** O KEDA adiciona overhead de polling e complexidade. Para cargas de trabalho que sempre têm tráfego e nunca precisam escalar para zero, o HPA simples é mais fácil e tem menor latência.

**"Executamos um node pool com autoscaler desabilitado."** Quando os autoscalers de pods criam demanda, nada provisiona novos nós. Você fica limitado aos nós provisionados na criação do cluster.

**"Escalamos rápido para cima e para baixo."** Scale-down rápido causa thrashing. O tráfego cai por 2 minutos, o CA remove um nó, o tráfego retorna, o CA adiciona um nó (o que leva 3-4 minutos). Defina `scale-down-unneeded-time` para pelo menos 10 minutos.

## Recursos

- [HPA on AKS](https://learn.microsoft.com/en-us/azure/aks/tutorial-kubernetes-scale#autoscale-pods)
- [Cluster Autoscaler](https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler-overview)
- [Node Autoprovision](https://learn.microsoft.com/en-us/azure/aks/node-autoprovision)
- [KEDA AKS add-on](https://learn.microsoft.com/en-us/azure/aks/keda-about)
- [VPA on AKS](https://learn.microsoft.com/en-us/azure/aks/vertical-pod-autoscaler)
- [Scaling best practices](https://learn.microsoft.com/en-us/azure/aks/best-practices-performance-scale)

---

**Próximo**: [Virtual Nodes](./virtual-nodes) -- escalabilidade serverless de burst para elasticidade extrema.
