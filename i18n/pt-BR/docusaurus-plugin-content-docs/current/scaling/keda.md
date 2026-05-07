---
sidebar_position: 3
title: "KEDA: Autoscaling Orientado a Eventos"
description: "Escale workloads de zero a N com base em eventos externos. Filas, HTTP, cron e triggers customizados."
---

# KEDA: autoscaling orientado a eventos

Use KEDA para qualquer workload orientado a eventos externos. O HPA sozinho não consegue escalar a zero ou reagir à profundidade de uma fila. O KEDA preenche essa lacuna e é a escolha correta para arquiteturas orientadas a eventos.

## O que o KEDA faz

KEDA (Kubernetes Event-Driven Autoscaling) observa fontes de eventos externas e escala seus workloads de acordo:

- **Zero para um**: Ativa deployments ociosos quando eventos chegam
- **Um para N**: Escala com base no backlog de eventos (funciona junto com o HPA)
- **N para zero**: Desativa deployments quando a fonte de eventos está vazia

:::info

O KEDA está integrado ao AKS como um add-on gerenciado. Não instale manualmente com Helm. Habilite o add-on e deixe o AKS gerenciar upgrades e disponibilidade.
:::

## Habilitando o KEDA no AKS

```bash
# Enable the KEDA add-on
az aks update \
  --resource-group myRG \
  --name myAKS \
  --enable-keda

# Verify it is running
kubectl get pods -n kube-system -l app=keda-operator
```

## Conceito central: ScaledObject

Um `ScaledObject` mapeia uma fonte de eventos para um Deployment e define como escalar:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-processor-scaler
spec:
  scaleTargetRef:
    name: order-processor
  pollingInterval: 15
  cooldownPeriod: 120
  minReplicaCount: 0
  maxReplicaCount: 30
  triggers:
  - type: azure-servicebus
    metadata:
      queueName: orders
      messageCount: "5"
      connectionFromEnv: SERVICEBUS_CONNECTION
```

Isso diz ao KEDA: escale o deployment `order-processor` para que haja aproximadamente 1 réplica a cada 5 mensagens na fila. Quando a fila estiver vazia, escale a zero.

## Scalers-chave para workloads AKS

| Scaler | Caso de Uso | Trigger |
|--------|----------|---------|
| `azure-servicebus` | Workers de processamento de mensagens | Contagem de mensagens na fila/tópico |
| `azure-queue` | Consumidores de Storage Queue | Tamanho da fila |
| `kafka` | Processamento de streams | Lag do consumer group |
| `prometheus` | Baseado em metrics (customizado) | Resultado de consulta PromQL |
| `cron` | Scaling agendado | Schedule baseado em tempo |
| `http` | Workloads HTTP | Taxa de requests (KEDA HTTP add-on) |

## KEDA + HPA: complementares, não concorrentes

:::tip

KEDA e HPA são complementares. Use KEDA para scale-to-zero e triggers orientados a eventos. Use HPA para scaling baseado em CPU/memória em estado estacionário. O KEDA na verdade cria recursos HPA por baixo dos panos quando as réplicas estão acima de zero.
:::

Um padrão comum:

- KEDA observa uma fila e escala de 0 para 1 quando mensagens chegam
- Uma vez rodando, o HPA assume para scaling baseado em CPU de 1 para N
- Quando a fila esvazia e a CPU cai, o KEDA escala de volta a 0

## Exemplo de produção: service bus com workload identity

```yaml
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: servicebus-auth
spec:
  podIdentity:
    provider: azure-workload
    identityId: <managed-identity-client-id>
---
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: invoice-worker-scaler
spec:
  scaleTargetRef:
    name: invoice-worker
  pollingInterval: 10
  cooldownPeriod: 300
  minReplicaCount: 0
  maxReplicaCount: 50
  triggers:
  - type: azure-servicebus
    authenticationRef:
      name: servicebus-auth
    metadata:
      namespace: invoicing
      queueName: pending-invoices
      messageCount: "10"
```

:::warning

Use Workload Identity para autenticação em produção. Connection strings em variáveis de ambiente são um risco de segurança. O KEDA suporta `podIdentity` nativamente no AKS.
:::

## Erros comuns

**Definir pollingInterval muito baixo.** Um intervalo de polling de 1 segundo contra o Azure Service Bus vai bater nos limites de taxa da API. Use 10-30 segundos para a maioria das fontes. A fila não vai a lugar nenhum.

**Não definir cooldownPeriod.** Sem um cooldown, o KEDA escala a zero no instante em que a fila esvazia. Se mensagens chegam em rajadas, você paga latência de cold-start em toda rajada. Defina cooldown de 2-5 minutos.

**Ignorar maxReplicaCount.** Uma inundação repentina de 100.000 mensagens vai tentar criar milhares de pods. Defina um máximo sensato baseado na capacidade do seu cluster e nas dependências downstream.

**Usar KEDA para tráfego HTTP constante.** Se o seu serviço sempre tem tráfego, HPA com CPU é mais simples e tem menos overhead. O KEDA brilha para workloads em rajada e orientados a eventos, não APIs com carga constante.

**Esquecer de tratar graceful shutdown.** Quando o KEDA escala para baixo, pods são terminados. Se o seu worker não trata SIGTERM e não finaliza mensagens em progresso, você perde trabalho. Implemente graceful shutdown com `terminationGracePeriodSeconds`.

## Decisão: quando usar KEDA

| Padrão de Workload | Solução de Scaling |
|-----------------|-----------------|
| API always-on com carga variável | HPA (CPU/latência) |
| Consumidor de fila que pode ficar ocioso | KEDA (profundidade da fila) |
| Cron job que precisa de scale específico em horários específicos | KEDA (cron trigger) |
| Processador de stream com sensibilidade a lag | KEDA (Kafka lag) |
| Workload que deve escalar a zero por custo | KEDA |
| Misto: eventos + tráfego constante | KEDA + HPA juntos |

## Recursos

- [KEDA AKS Add-on](https://learn.microsoft.com/en-us/azure/aks/keda-about)
- [KEDA Scalers Catalog](https://keda.sh/docs/scalers/)
- [KEDA + Workload Identity](https://learn.microsoft.com/en-us/azure/aks/keda-workload-identity)
