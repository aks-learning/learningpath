---
sidebar_position: 4
title: "Guia de produção AI/ML"
description: "Execute cargas de trabalho de inferência AI no AKS em escala de produção: estratégia de node pool GPU, cache de modelos, autoscaling, controles de custo e servindo múltiplos modelos."
---

# Guia de produção AI/ML

Executar um node pool GPU para experimentos é fácil. Executar inferência AI em escala de produção no AKS sem estourar o orçamento requer decisões de arquitetura cuidadosas. Este guia cobre o que importa.

## Estratégia de node pool GPU

### Seleção de SKU

Escolha a família de GPU com base na carga de trabalho, não a que tem mais VRAM.

| Série | Melhor para | GPU | VRAM | Use quando |
|--------|----------|-----|------|----------|
| NC-series (T4) | Treinamento, fine-tuning | NVIDIA T4 | 16 GB | Você precisa de treinamento econômico ou inferência de modelos pequenos |
| NC A100 | Treinamento de modelos grandes | NVIDIA A100 | 80 GB | Você está treinando modelos que precisam de alta largura de banda de memória |
| ND-series (H100) | Inferência de modelos grandes | NVIDIA H100 | 80 GB | Você está servindo modelos com 70B+ parâmetros em produção |
| NV-series (A10) | Visualização, inferência leve | NVIDIA A10 | 24 GB | Você precisa de renderização ou modelos com menos de 13B parâmetros |

:::warning

Não use nós ND-series H100 por padrão. Eles custam de 10 a 30x mais que nós NC T4. Um modelo de 7B parâmetros roda bem em um único T4. Dimensione corretamente primeiro, faça upgrade depois.

:::

### Pools GPU spot para trabalhos não críticos

Use instâncias spot para inferência em lote, jobs de avaliação e cargas de trabalho de desenvolvimento. Não use spot para servir inferência em tempo real que tenha SLAs de latência.

```bash
az aks nodepool add \
  --resource-group myResourceGroup \
  --cluster-name myAKSCluster \
  --name gpuspot \
  --node-count 1 \
  --node-vm-size Standard_NC6s_v3 \
  --priority Spot \
  --eviction-policy Delete \
  --spot-max-price -1 \
  --labels workload-type=batch-gpu
```

### Taints e tolerations

Sempre aplique taints em node pools GPU. Sem taints, o scheduler colocará cargas de trabalho CPU em nós GPU caros.

```bash
az aks nodepool add \
  --resource-group myResourceGroup \
  --cluster-name myAKSCluster \
  --name gpupool \
  --node-count 1 \
  --node-vm-size Standard_NC6s_v3 \
  --node-taints sku=gpu:NoSchedule \
  --labels sku=gpu
```

Adicione a toleration correspondente em cada carga de trabalho GPU:

```yaml
tolerations:
  - key: "sku"
    operator: "Equal"
    value: "gpu"
    effect: "NoSchedule"
resources:
  limits:
    nvidia.com/gpu: 1
```

### Scale-to-zero para economia de custos

Nós GPU ociosos custam o mesmo que nós GPU sob carga. Use KEDA com contagem mínima de nós igual a zero para eliminar gasto ocioso.

```bash
az aks nodepool add \
  --resource-group myResourceGroup \
  --cluster-name myAKSCluster \
  --name gpuondemand \
  --node-count 0 \
  --min-count 0 \
  --max-count 4 \
  --enable-cluster-autoscaler \
  --node-vm-size Standard_NC6s_v3 \
  --node-taints sku=gpu:NoSchedule
```

:::info

Nós GPU levam de 5 a 10 minutos para provisionar e ficar prontos. Considere esse tempo de cold-start na sua estratégia de escalabilidade. Para cargas de trabalho sensíveis à latência, mantenha pelo menos um nó aquecido.

:::

## Opções para servir modelos

### Tabela de decisão

Escolha uma opção e comprometa-se. Não construa uma camada de serving customizada a menos que tenha uma equipe para mantê-la.

| Opção | Melhor para | Complexidade | Multi-modelo | Modelos customizados |
|--------|----------|------------|-------------|---------------|
| KAITO | Modelos open-source populares | Baixa | Não | Limitado |
| vLLM | Inferência LLM de alto throughput | Média | Sim | Sim |
| Text Generation Inference (TGI) | Modelos HuggingFace | Média | Não | Sim |
| Triton Inference Server | Multi-framework, modelos não-LLM | Alta | Sim | Sim |

### KAITO

Use KAITO quando quiser implantar um modelo suportado com configuração mínima. KAITO cuida do provisionamento de nós GPU, download do modelo e serving automaticamente.

```yaml
apiVersion: kaito.sh/v1alpha1
kind: Workspace
metadata:
  name: llama-3-8b
spec:
  resource:
    instanceType: Standard_NC24ads_A100_v4
    labelSelector:
      matchLabels:
        apps: llama-3-8b
  inference:
    preset:
      name: llama-3-8b-instruct
```

:::tip

Comece com KAITO para sua primeira implantação. Migre para vLLM ou Triton apenas quando atingir as limitações do KAITO: pesos de modelo customizados, batching avançado ou serving multi-modelo em uma única GPU.

:::

### vLLM no AKS

Use vLLM quando precisar de alto throughput, continuous batching ou multiplexação de modelos. Implante-o como um deployment Kubernetes padrão.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vllm
  template:
    metadata:
      labels:
        app: vllm
    spec:
      tolerations:
        - key: "sku"
          operator: "Equal"
          value: "gpu"
          effect: "NoSchedule"
      containers:
        - name: vllm
          image: vllm/vllm-openai:latest
          args: ["--model", "meta-llama/Llama-3-8B-Instruct",
                 "--max-model-len", "4096",
                 "--gpu-memory-utilization", "0.9"]
          resources:
            limits:
              nvidia.com/gpu: 1
          ports:
            - containerPort: 8000
          volumeMounts:
            - name: model-cache
              mountPath: /root/.cache/huggingface
      volumes:
        - name: model-cache
          persistentVolumeClaim:
            claimName: model-cache-pvc
```

## Cache e armazenamento de modelos

Carregar um modelo de 16 GB da internet a cada inicialização de pod é o erro mais comum em AI de produção no Kubernetes.

### Azure Files NFS para pesos de modelo compartilhados

Use Azure Files com NFS para modelos que múltiplos pods precisam acessar simultaneamente. Isso evita baixar o mesmo modelo para cada réplica.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: model-cache-pvc
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: azurefile-csi-nfs
  resources:
    requests:
      storage: 100Gi
```

### Init containers para download de modelos

Use um init container para baixar pesos do modelo do Azure Blob Storage antes que o servidor de inferência inicie. Isso separa a etapa de download do container de serving.

```yaml
initContainers:
  - name: model-downloader
    image: mcr.microsoft.com/azure-cli:latest
    command:
      - bash
      - -c
      - |
        az storage blob download-batch \
          --destination /models \
          --source model-weights \
          --account-name mystorageaccount \
          --auth-mode login
    volumeMounts:
      - name: model-volume
        mountPath: /models
```

### Cache NVMe local em VMs GPU

SKUs de VM GPU com NVMe local (NC A100 v4, ND H100 v5) oferecem armazenamento local rápido. Use-o como camada de cache para modelos quentes. Monte o disco local e copie modelos para lá no primeiro acesso.

:::tip

Combine Azure Files NFS como fonte de verdade com NVMe local como cache read-through. O compartilhamento NFS mantém todos os modelos; cada nó copia apenas os modelos necessários para o NVMe local na inicialização do pod.

:::

### Evite modelos baseados em imagem em escala

Embutir pesos do modelo na imagem do container significa pulls lentos, altos custos de egress do registro e tempos longos de inicialização de nós. Use isso apenas para modelos com menos de 2 GB.

## Autoscaling de cargas de trabalho AI

### KEDA com métricas Prometheus

KEDA é a melhor opção para escalar inferência AI no AKS. Use métricas Prometheus do seu servidor de inferência como trigger de escalabilidade.

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: vllm-scaler
spec:
  scaleTargetRef:
    name: vllm-server
  minReplicaCount: 1
  maxReplicaCount: 8
  cooldownPeriod: 300
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus-server.monitoring:9090
        metricName: vllm_pending_requests
        query: sum(vllm:num_requests_waiting)
        threshold: "10"
```

Métricas-chave para escalar:

| Métrica | Escale quando | Por quê |
|--------|-----------|-----|
| Profundidade da fila / requisições pendentes | Requisições esperando > threshold | Mede diretamente a demanda acumulada |
| Utilização de GPU | Sustentada > 80% | Indica saturação de computação |
| Latência de requisição (p95) | Excede o alvo de SLA | Captura degradação antes que os usuários percebam |
| Tamanho do batch | Consistentemente no máximo | Significa que o servidor não está dando conta |

### HPA com métricas customizadas

Se você não está usando KEDA, configure HPA com métricas customizadas do Prometheus adapter. KEDA é preferido porque suporta scale-to-zero.

### Scale-to-zero fora do horário

```yaml
spec:
  minReplicaCount: 0
  triggers:
    - type: cron
      metadata:
        timezone: America/Los_Angeles
        start: 0 8 * * 1-5
        end: 0 20 * * 1-5
        desiredReplicas: "1"
```

### Considerações do node autoscaler

O cluster autoscaler provisiona nós GPU quando pods estão pendentes. Espere de 5 a 10 minutos para um nó GPU se tornar agendável. Use classes de prioridade de pod para que pods de inferência críticos sejam agendados primeiro, e considere sobreprovisionar um nó durante horários de pico.

## Controles de custo

Computação GPU é o maior fator de custo em cargas de trabalho AI. Cada otimização aqui tem um impacto direto em dinheiro.

### Instâncias spot para inferência em lote

Use pools GPU spot para qualquer carga de trabalho que tolere interrupção: scoring em lote, avaliação de modelo, geração de embeddings offline. VMs GPU spot custam de 60 a 90% menos que sob demanda.

### Instâncias reservadas para estado estável

Se você executa inferência em produção 24/7, compre uma reserva de 1 ou 3 anos. A economia varia de 30 a 60% em relação ao pay-as-you-go.

### Parar/iniciar cluster para dev/test

Pare clusters GPU quando não estiverem em uso. Um único Standard_NC6s_v3 custa aproximadamente $2.700/mês. Parar fora do horário de trabalho economiza até 65%.

```bash
# Pare o cluster (desaloca todos os nós)
az aks stop --resource-group myResourceGroup --name myDevGPUCluster

# Inicie o cluster
az aks start --resource-group myResourceGroup --name myDevGPUCluster
```

### Dimensionamento correto de SKUs GPU

Não use uma A100 para servir um modelo de 7B parâmetros. Combine a GPU com o tamanho do modelo.

| Tamanho do modelo | GPU recomendada | VRAM necessária |
|-----------|-----------------|-------------|
| < 3B parâmetros | T4 (16 GB) | 6-8 GB |
| 7-8B parâmetros | T4 (16 GB) ou A10 (24 GB) | 14-16 GB |
| 13B parâmetros | A10 (24 GB) | 24 GB |
| 30-34B parâmetros | A100 (80 GB) | 60-70 GB |
| 70B+ parâmetros | 2x A100 ou H100 | 140+ GB |

:::warning

Modelos quantizados (GPTQ, AWQ, GGUF) usam significativamente menos VRAM. Um modelo de 70B quantizado para 4-bit cabe em uma única A100. Sempre verifique os tamanhos de modelos quantizados antes de selecionar seu SKU GPU.

:::

### Alertas de orçamento

Configure alertas de orçamento no resource group que contém os nós GPU. Gastos com GPU escalam rapidamente se o autoscaling estiver mal configurado.

## Serving multi-modelo

### Multiplexação de modelos em uma única GPU

vLLM suporta servir múltiplos adaptadores LoRA a partir de um único modelo base. Use isso para variantes fine-tuned do mesmo modelo base.

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3-8B-Instruct \
  --enable-lora \
  --lora-modules customer-a=/models/lora-a customer-b=/models/lora-b \
  --max-loras 4
```

### Deployments separados por modelo

Quando modelos têm arquiteturas ou requisitos de GPU diferentes, implante-os como deployments Kubernetes separados com políticas de escalabilidade independentes.

### Roteamento A/B de modelos via ingress

Use regras de ingress para rotear tráfego entre versões de modelos para deployments canary e rollouts graduais. Defina `nginx.ingress.kubernetes.io/canary-weight` para controlar a divisão de tráfego entre versões de modelos.

## Erros comuns

| Erro | Por que prejudica | Correção |
|---------|-------------|-----|
| SKUs GPU superdimensionados | Pagando por VRAM que você não usa | Profile o uso de memória do modelo, escolha o menor SKU que serve |
| Sem autoscaling em pools GPU | GPUs ociosas custam o mesmo que ocupadas | Use KEDA com scale-to-zero para cargas de trabalho não críticas |
| Carregando modelos da internet na inicialização | Adiciona de 5 a 15 minutos a cada start de pod | Faça cache de modelos no Azure Files NFS ou NVMe local |
| Sem taints em node pools GPU | Cargas de trabalho CPU vão para nós GPU | Aplique taint em todos os pools GPU com `sku=gpu:NoSchedule` |
| GPU ociosa durante baixo tráfego | Desperdiçando dinheiro com GPUs ligadas sem requisições | Scale-to-zero com KEDA ou pare clusters de dev |
| Embutindo modelos grandes em imagens de container | Pulls de imagem lentos, custos altos de registro | Use montagens de volume com armazenamento compartilhado |
| Réplica única sem health checks | Um crash derruba a inferência | Execute pelo menos 2 réplicas com probes de liveness e readiness |

## Recursos

- [Usar GPUs no AKS](https://learn.microsoft.com/azure/aks/gpu-cluster)
- [KAITO no AKS](https://learn.microsoft.com/azure/aks/ai-toolchain-operator)
- [Autoscaling KEDA no AKS](https://learn.microsoft.com/azure/aks/keda-about)
- [Cluster autoscaler do AKS](https://learn.microsoft.com/azure/aks/cluster-autoscaler)
- [Node pools spot no AKS](https://learn.microsoft.com/azure/aks/spot-node-pool)
- [Azure Files NFS no AKS](https://learn.microsoft.com/azure/aks/azure-files-csi)
- [Tamanhos de VM GPU no Azure](https://learn.microsoft.com/azure/virtual-machines/sizes-gpu)
- [Planos de economia e reservas Azure](https://learn.microsoft.com/azure/cost-management-billing/savings-plan/savings-plan-compute-overview)
