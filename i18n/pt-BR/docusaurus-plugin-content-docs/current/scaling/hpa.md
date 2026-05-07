---
sidebar_position: 1
title: "Horizontal Pod Autoscaler"
description: "Escale pods automaticamente com base em CPU, memória e metrics customizadas. Pare de adivinhar contagem de réplicas."
---

# Horizontal Pod Autoscaler

SEMPRE configure HPA para workloads de produção. Uma contagem fixa de réplicas significa que você está desperdiçando dinheiro durante tráfego baixo ou prestes a cair durante tráfego alto. Não existe meio-termo.

## Como o HPA Funciona

O controller do HPA verifica metrics a cada 15 segundos (configurável). Ele compara a utilização atual com o seu target e ajusta a contagem de réplicas de acordo:

```
desiredReplicas = ceil(currentReplicas * (currentMetric / targetMetric))
```

:::warning

O HPA usa **utilização baseada em requests**, não capacidade real do node. Se o seu pod solicita 100m CPU e usa 80m, o HPA enxerga 80% de utilização. Se seus requests estiverem errados, o HPA toma decisões erradas. Sempre dimensione os requests corretamente primeiro.
:::

## Configuração Essencial

| Parâmetro | Recomendação | Por Quê |
|-----------|---------------|-----|
| `minReplicas` | 2+ para produção | Réplica única = zero disponibilidade durante reinícios |
| `maxReplicas` | Defina de acordo com seu orçamento | Scaling ilimitado vai quebrar seu orçamento |
| `targetCPUUtilization` | 60-70% | Deixa margem para picos de tráfego antes que novos pods estejam prontos |
| `stabilizationWindowSeconds` | 300 (scale-down) | Previne oscilação durante carga flutuante |

## Exemplo de HPA Pronto para Produção

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 65
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
```

:::tip

Escale para cima agressivamente, escale para baixo conservadoramente. O custo de sobre-provisionar por alguns minutos é muito menor que o custo de perder requests.
:::

## Metrics Customizadas: Quando CPU Não é Suficiente

Scaling baseado em CPU é o básico. Workloads de produção precisam de metrics customizadas:

- **Profundidade da fila** -- escale workers com base em mensagens pendentes
- **Latência de requests** -- escale quando a latência p95 exceder o SLO
- **Conexões ativas** -- escale serviços WebSocket ou gRPC
- **Metrics de negócio** -- pedidos por minuto, sessões ativas

Use Prometheus Adapter ou KEDA para expor metrics customizadas ao HPA.

## Erros Comuns

**Definir min = max réplicas.** Isso desabilita o autoscaling completamente. Se você quer uma contagem fixa, apenas defina `replicas` no Deployment e pule o HPA.

**Não definir resource requests.** Sem requests, o HPA não tem baseline para calcular utilização. Ele simplesmente não vai escalar. Todo container deve ter requests de CPU e memória.

**Mirar em 90%+ de utilização.** No momento em que você atinge 90%, novos pods levam 30-60 segundos para ficar prontos. Seus pods existentes estão saturados e perdendo requests durante essa janela.

**Ignorar o comportamento de scale-down.** O scale-down padrão é agressivo. Uma queda breve no tráfego pode disparar scale-down, e quando o tráfego retorna, você espera novos pods iniciarem. Defina estabilização de pelo menos 5 minutos.

**Usar HPA com VPA na mesma metric.** HPA e Vertical Pod Autoscaler brigam entre si quando ambos miram CPU. Use VPA apenas para memória se você precisar de ambos.

## Verificando o Status do HPA

```bash
kubectl get hpa api-hpa
kubectl describe hpa api-hpa
# Check if metrics are being collected
kubectl top pods -l app=api-server
```

## Decisão: Quando Usar HPA vs Alternativas

| Cenário | Use |
|----------|-----|
| Tráfego estável com padrões previsíveis | HPA com CPU |
| API com targets de SLO | HPA com metric customizada de latência |
| Consumidores de fila que podem ficar ociosos | KEDA (scale to zero) |
| Jobs em lote disparados por eventos | KEDA |
| Bursts repentinos e imprevisíveis | HPA + Cluster Autoscaler |

## Recursos

- [AKS HPA Walkthrough](https://learn.microsoft.com/en-us/azure/aks/tutorial-kubernetes-scale#autoscale-pods)
- [HPA Algorithm Details](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/#algorithm-details)
- [Scaling Best Practices](https://learn.microsoft.com/en-us/azure/aks/best-practices-performance-scale)
