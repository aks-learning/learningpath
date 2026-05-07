---
sidebar_position: 2
title: "Estrategias de Deploy"
description: "Rolling updates, blue/green e canary deployments no AKS com orientacao opinativa sobre quando usar cada um."
---

# Estrategias de Deploy

A maioria dos times complica demais isso. Use rolling updates como seu padrao. Adicione canary para os dois ou tres servicos onde um deploy ruim custa dinheiro de verdade. Pule blue/green a menos que tenha um motivo muito especifico.

## Tabela de Decisao

| Estrategia | Complexidade | Custo de recursos | Velocidade de rollback | Melhor para |
|------------|-------------|-------------------|----------------------|-------------|
| Rolling update | Baixa | 1x + surge | Lento (re-deploy) | 90% dos workloads |
| Canary | Media | 1x + pequena % | Rapido (redirecionar trafego) | Servicos criticos voltados ao usuario |
| Blue/Green | Alta | 2x | Instantaneo (swap) | Apps stateful, bancos de dados, alta conformidade |

:::tip

Use rolling updates como seu padrao. Adicione canary para servicos criticos voltados ao usuario onde voce precisa validar com trafego real antes do rollout completo. Blue/green e caro (2x recursos permanentemente) e raramente necessario no Kubernetes -- a plataforma ja oferece rollbacks declarativos.
:::

## Rolling Update (Padrao)

Rolling updates substituem gradualmente pods antigos por novos. O Kubernetes lida com isso nativamente sem nenhuma configuracao alem do spec do seu Deployment.

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

Sempre configure `maxUnavailable: 0` para servicos em producao. O padrao de 25% significa que o Kubernetes vai matar pods antes que os novos estejam prontos. Combinado com `maxSurge: 1`, voce consegue deploys sem downtime que sao um pouco mais lentos mas nunca perdem requisicoes.
:::

**Configuracoes criticas que as pessoas esquecem:**

- `progressDeadlineSeconds`: Sem isso, um deployment quebrado fica travado para sempre. Configure entre 300-600 segundos.
- `readinessProbe`: Sem isso, o Kubernetes roteia trafego para pods que nao estao prontos. Todo deployment sem readiness probe e uma potencial indisponibilidade.
- `minReadySeconds`: Adicione 10-30 segundos para capturar pods que crasham logo apos iniciar.

## Canary Deployments

Canary envia uma pequena porcentagem do trafego para a nova versao. Voce monitora taxas de erro e latencia, e entao promove ou faz rollback. Nao implemente isso manualmente com multiplos Deployments e seletores de service -- use uma ferramenta adequada.

:::tip

Se voce precisa de canary, use Argo Rollouts. E maduro, bem documentado e funciona com qualquer service mesh ou ingress controller. Flagger e a alternativa CNCF mas tem uma comunidade menor e configuracao menos intuitiva.
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

O Argo Rollouts integra com Prometheus para analise automatizada. Se a taxa de erro exceder o limite durante qualquer etapa de pausa, ele faz rollback automaticamente:

```yaml
      analysis:
        templates:
          - templateName: error-rate
        startingStep: 1    # Start checking after first weight shift
```

## Blue/Green

Dois ambientes completos rodando simultaneamente. O trafego alterna instantaneamente entre eles. Isso e caro e geralmente desnecessario no Kubernetes.

**Quando blue/green realmente faz sentido:**
- Migracoes de schema de banco de dados que nao podem ser revertidas
- Ambientes de conformidade que exigem validacao completa pre-producao
- Servicos stateful onde rolling updates causam problemas de sessao

Para todo o resto, rolling updates ou canary sao mais baratos e simples.

## Erros Comuns

- Sem readiness probes: O Kubernetes envia trafego para pods nao prontos durante o rollout. Sempre.
- Sem progress deadline: Deployments quebrados ficam travados indefinidamente, bloqueando o proximo deploy.
- Canary manual com seletores de label: Fragil, propenso a erros e nao oferece rollback automatizado.
- Pular `minReadySeconds`: Pods que crasham apos 3 segundos parecem saudaveis durante o rollout.
- Blue/green para servicos stateless: Voce esta pagando por 2x de computacao para um rollback instantaneo que poderia obter com `kubectl rollout undo`.

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

O Kubernetes mantem 10 revisoes por padrao (`revisionHistoryLimit`). Nao configure isso como 0 -- voce perde a capacidade de fazer rollback. Mantenha pelo menos 5.
:::

## Recursos

- [Estrategias de Deployment do Kubernetes](https://learn.microsoft.com/en-us/azure/aks/concepts-clusters-workloads#deployments-and-yaml-manifests)
- [Documentacao do Argo Rollouts](https://argoproj.github.io/argo-rollouts/)
- [Flagger Progressive Delivery](https://flagger.app/)
- [Pod Disruption Budgets](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
