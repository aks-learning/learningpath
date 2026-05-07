---
sidebar_position: 4
title: "Virtual Nodes (Integração com ACI)"
description: "Expanda para Azure Container Instances em picos repentinos. Pods serverless sem gerenciamento de nodes."
---

# Virtual nodes (integração com ACI)

Virtual Nodes são nicho. Use-os para jobs em lote e cenários de burst APENAS. Não use para workloads em estado estacionário. Para a maioria dos times, KEDA mais Cluster Autoscaler é uma história de scaling melhor.

## Como virtual nodes funcionam

Virtual Nodes usam o Virtual Kubelet para apresentar Azure Container Instances (ACI) como um node no seu cluster. Quando pods são agendados no virtual node, eles rodam como containers serverless no ACI ao invés de em VMs.

```
Pod scheduled to virtual node
    -> Virtual Kubelet intercepts
    -> Creates ACI container group
    -> Pod runs serverless (no VM to manage)
    -> Pay per second of execution
```

:::info

Virtual Nodes provisionam pods em segundos (não minutos como nodes reais). Isso os torna úteis para absorver picos repentinos que não podem esperar o Cluster Autoscaler provisionar VMs.
:::

## Habilitando virtual nodes

```bash
# Requires a subnet delegated to ACI
az aks enable-addons \
  --resource-group myRG \
  --name myAKS \
  --addons virtual-node \
  --subnet-name aci-subnet
```

## Quando usar virtual nodes

| Cenário | Boa Escolha? | Por Quê |
|----------|-----------|-----|
| Builds de CI/CD em burst | Sim | Curta duração, sem estado, demanda elástica |
| Processamento em lote orientado a eventos | Sim | Burst para centenas de pods, pague apenas pela execução |
| Absorver picos de tráfego | Talvez | Provisionamento rápido, mas rede limitada |
| Servir API em estado estacionário | Não | Custo por segundo do ACI excede custo de VM em escala |
| Workloads que precisam de DaemonSets | Não | Virtual Nodes não suportam DaemonSets |
| Workloads stateful | Não | Sem suporte a volume persistente |

:::tip

O ponto ideal para Virtual Nodes: workloads de curta duração, stateless, embaraçosamente paralelos e que chegam em rajadas imprevisíveis. Pense em pipelines de processamento de imagem, geração de relatórios ou testes de carga.
:::

## Exemplo: job em burst para virtual node

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: report-generator
spec:
  parallelism: 50
  completions: 200
  template:
    spec:
      nodeSelector:
        kubernetes.io/role: agent
        type: virtual-kubelet
      tolerations:
      - key: virtual-kubelet.io/provider
        operator: Exists
      - key: azure.com/aci
        effect: NoSchedule
      containers:
      - name: worker
        image: myregistry.azurecr.io/report-worker:latest
        resources:
          requests:
            cpu: "1"
            memory: "2Gi"
          limits:
            cpu: "2"
            memory: "4Gi"
      restartPolicy: Never
  backoffLimit: 3
```

Isso agenda 50 pods paralelos no ACI. Eles sobem em segundos, processam relatórios e terminam. Você paga apenas pelo tempo de execução.

## Limitações concretas

Não ignore estas. Elas não são casos extremos; vão te morder em produção:

| Limitação | Impacto |
|-----------|--------|
| Apenas containers Linux | Sem workloads Windows nos Virtual Nodes |
| Sem volumes persistentes | Não é possível montar Azure Disks ou Azure Files PVCs |
| Sem DaemonSets | Agentes de monitoramento e coletores de log não rodam em pods ACI |
| Rede limitada | Pods ACI recebem IPs da subnet delegada, não do pod CIDR |
| Sem host networking | Não é possível usar hostPort ou hostNetwork |
| Sem containers privilegiados | Contextos de segurança com privilégios elevados são rejeitados |
| Limitações de init containers | Suporte limitado a init containers |
| Sem compartilhamento de GPU | Containers GPU suportados, mas sem GPU fracionária |

:::warning

Virtual Nodes não podem rodar sua stack padrão de monitoramento (Prometheus node exporter, Fluent Bit DaemonSet). Pods ACI precisam de configuração de observabilidade separada. Use Azure Monitor container insights para workloads ACI.
:::

## Comparação de custos

Virtual Nodes cobram por segundo de vCPU e memória:

- ACI: ~$0.000012/segundo por vCPU, ~$0.0000013/segundo por GB de memória
- Um pod usando 1 vCPU + 2 GB por 1 hora custa ~$0.05
- Uma VM D2s_v5 equivalente (2 vCPU, 8 GB) custa ~$0.096/hora

**Regra geral**: Se um workload roda mais de 50% do tempo, rode em nodes reais. Virtual Nodes são custo-efetivos apenas para workloads intermitentes em burst.

## Virtual nodes vs alternativas

| Abordagem | Velocidade | Modelo de Custo | Melhor Para |
|----------|-------|-----------|----------|
| Cluster Autoscaler | 2-4 min (novo node) | Taxa horária de VM | Scaling sustentado |
| Virtual Nodes | 5-15 segundos | Por segundo ACI | Bursts curtos |
| KEDA + CA | 2-4 min (cold) | Taxa de VM + scale to zero | Orientado a eventos |
| Node pools Spot | 2-4 min | VMs com 60-90% desconto | Lote tolerante a falhas |

## Erros comuns

**Usar Virtual Nodes como sua computação principal.** ACI não é substituto para VMs em escala. O custo por segundo soma rápido para workloads always-on. Use nodes reais para baseline, Virtual Nodes apenas para picos.

**Ignorar o tamanho da subnet.** Cada pod ACI recebe um IP da sua subnet delegada. Um /24 dá 251 IPs. Se você fizer burst de 300 pods, alguns vão falhar ao ser agendados. Dimensione sua subnet ACI para o seu burst máximo.

**Esperar paridade completa de funcionalidades do Kubernetes.** Service mesh, network policies, montagem de volumes, init containers -- muitas funcionalidades funcionam de forma diferente ou não funcionam no ACI. Teste extensivamente antes de depender de Virtual Nodes em produção.

**Não definir resource limits.** ACI cobra por recursos alocados, não apenas pelo que você usa. Defina resource requests e limits precisos para evitar pagar por capacidade que seus pods nunca utilizam.

## Recursos

- [Virtual Nodes on AKS](https://learn.microsoft.com/en-us/azure/aks/virtual-nodes)
- [ACI Pricing](https://azure.microsoft.com/en-us/pricing/details/container-instances/)
- [Virtual Kubelet](https://learn.microsoft.com/en-us/azure/aks/virtual-nodes-cli)
