---
sidebar_position: 2
title: "Estratégias de Deploy"
description: "Rolling updates, blue/green e canary deployments no AKS com orientação opinativa sobre quando usar cada um."
---

# Estratégias de deploy

A maioria dos times complica demais isso. Use rolling updates como seu padrão. Adicione canary para os dois ou três serviços onde um deploy ruim custa dinheiro de verdade. Pule blue/green a menos que tenha um motivo muito específico.

## Tabela de decisão

| Estratégia | Complexidade | Custo de recursos | Velocidade de rollback | Melhor para |
|------------|-------------|-------------------|----------------------|-------------|
| Rolling update | Baixa | 1x + surge | Lento (re-deploy) | 90% dos workloads |
| Canary | Média | 1x + pequena % | Rápido (redirecionar tráfego) | Serviços críticos voltados ao usuário |
| Blue/Green | Alta | 2x | Instantâneo (swap) | Apps stateful, bancos de dados, alta conformidade |

:::tip

Use rolling updates como seu padrão. Adicione canary para serviços críticos voltados ao usuário onde você precisa validar com tráfego real antes do rollout completo. Blue/green é caro (2x recursos permanentemente) e raramente necessário no Kubernetes -- a plataforma já oferece rollbacks declarativos.
:::

## Rolling update (padrão)

Rolling updates substituem gradualmente pods antigos por novos. O Kubernetes lida com isso nativamente sem nenhuma configuração além do spec do seu Deployment.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # Create 1 extra pod during rollout
      maxUnavailable: 0    # Never have fewer than 4 ready pods
  progressDeadlineSeconds: 300  # Fail the rollout if stuck for 5 min
  template:
    spec:
      containers:
        - name: myapp
          image: myacr.azurecr.io/myapp:v2.1.0
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
```

:::warning

Sempre configure `maxUnavailable: 0` para serviços em produção. O padrão de 25% significa que o Kubernetes vai matar pods antes que os novos estejam prontos. Combinado com `maxSurge: 1`, você consegue deploys sem downtime que são um pouco mais lentos mas nunca perdem requisições.
:::

**Configurações críticas que as pessoas esquecem:**

- `progressDeadlineSeconds`: Sem isso, um deployment quebrado fica travado para sempre. Configure entre 300-600 segundos.
- `readinessProbe`: Sem isso, o Kubernetes roteia tráfego para pods que não estão prontos. Todo deployment sem readiness probe é uma potencial indisponibilidade.
- `minReadySeconds`: Adicione 10-30 segundos para capturar pods que crasham logo após iniciar.

## Canary deployments

Canary envia uma pequena porcentagem do tráfego para a nova versão. Você monitora taxas de erro e latência, e então promove ou faz rollback. Não implemente isso manualmente com múltiplos Deployments e seletores de service -- use uma ferramenta adequada.

:::tip

Se você precisa de canary, use Argo Rollouts. É maduro, bem documentado e funciona com qualquer service mesh ou ingress controller. Flagger é a alternativa CNCF mas tem uma comunidade menor e configuração menos intuitiva.
:::

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: myapp
spec:
  replicas: 5
  strategy:
    canary:
      steps:
        - setWeight: 10     # Send 10% of traffic to canary
        - pause: {duration: 5m}
        - setWeight: 30
        - pause: {duration: 5m}
        - setWeight: 60
        - pause: {duration: 5m}
      canaryMetadata:
        labels:
          role: canary
      trafficRouting:
        nginx:
          stableIngress: myapp-ingress
  template:
    spec:
      containers:
        - name: myapp
          image: myacr.azurecr.io/myapp:v2.1.0
```

O Argo Rollouts integra com Prometheus para análise automatizada. Se a taxa de erro exceder o limite durante qualquer etapa de pausa, ele faz rollback automaticamente:

```yaml
      analysis:
        templates:
          - templateName: error-rate
        startingStep: 1    # Start checking after first weight shift
```

## Blue/green

Dois ambientes completos rodando simultaneamente. O tráfego alterna instantaneamente entre eles. Isso é caro e geralmente desnecessário no Kubernetes.

**Quando blue/green realmente faz sentido:**
- Migrações de schema de banco de dados que não podem ser revertidas
- Ambientes de conformidade que exigem validação completa pré-produção
- Serviços stateful onde rolling updates causam problemas de sessão

Para todo o resto, rolling updates ou canary são mais baratos e simples.

## Erros comuns

- Sem readiness probes: O Kubernetes envia tráfego para pods não prontos durante o rollout. Sempre.
- Sem progress deadline: Deployments quebrados ficam travados indefinidamente, bloqueando o próximo deploy.
- Canary manual com seletores de label: Frágil, propenso a erros e não oferece rollback automatizado.
- Pular `minReadySeconds`: Pods que crasham após 3 segundos parecem saudáveis durante o rollout.
- Blue/green para serviços stateless: Você está pagando por 2x de computação para um rollback instantâneo que poderia obter com `kubectl rollout undo`.

## Rollback

Rolling updates suportam rollback nativo:

```bash
# Immediate rollback to previous revision
kubectl rollout undo deployment/myapp

# Check rollout history
kubectl rollout history deployment/myapp

# Rollback to specific revision
kubectl rollout undo deployment/myapp --to-revision=3
```

:::info

O Kubernetes mantém 10 revisões por padrão (`revisionHistoryLimit`). Não configure isso como 0 -- você perde a capacidade de fazer rollback. Mantenha pelo menos 5.
:::

## Recursos

- [Estratégias de Deployment do Kubernetes](https://learn.microsoft.com/en-us/azure/aks/concepts-clusters-workloads#deployments-and-yaml-manifests)
- [Documentação do Argo Rollouts](https://argoproj.github.io/argo-rollouts/)
- [Flagger Progressive Delivery](https://flagger.app/)
- [Pod Disruption Budgets](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
