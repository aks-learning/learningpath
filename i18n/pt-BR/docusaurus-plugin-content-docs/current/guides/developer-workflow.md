---
sidebar_position: 2
title: "Fluxo de trabalho do desenvolvedor"
description: "Guia completo para desenvolvedores entregando serviços no AKS: do desenvolvimento local ao deployment em produção."
---

# Fluxo de trabalho do desenvolvedor

Você é um desenvolvedor entregando um serviço no AKS. Você não precisa entender rede do cluster, node pools ou internos do Kubernetes. Este guia cobre exatamente o que você precisa: construir, implantar, depurar, repetir.

## Desenvolvimento local

### Container runtime

Use Docker Desktop ou Podman para executar containers localmente. Não desenvolva em um cluster compartilhado para trabalho de inner-loop — é lento e cria conflitos com outros desenvolvedores.

| Ferramenta | Quando usar |
|---|---|
| Docker Desktop | Escolha padrão. Funciona no macOS, Windows, Linux. Kubernetes integrado. |
| Podman | Quando precisar de uma alternativa sem daemon e sem root. Bom para runners de CI e ambientes restritos. |

### Desenvolvimento inner-loop

Use Tilt ou Skaffold para obter hot-reload em um cluster Kubernetes local. Não execute manualmente `docker build` e `kubectl apply` em loop — desperdiça tempo e você vai esquecer etapas.

```bash
# Tilt — define a Tiltfile in your repo root
tilt up

# Skaffold — define skaffold.yaml in your repo root
skaffold dev
```

:::tip

O Tilt é a melhor escolha se sua equipe executa múltiplos serviços localmente. Ele lida com orquestração de múltiplos serviços com um dashboard que mostra status de build e runtime em um só lugar. O Skaffold é mais simples para desenvolvimento de um único serviço.

:::

### Bridge to Kubernetes

Quando precisar depurar contra um serviço que existe apenas no cluster (um banco de dados, uma fila de mensagens, uma API upstream), use Bridge to Kubernetes. Ele roteia tráfego do cluster remoto para sua máquina local.

```bash
# Install the VS Code extension: "Bridge to Kubernetes"
# Or use the CLI
bridge-to-kubernetes connect --service <service-name> --namespace <namespace>
```

Não use port-forwarding para sessões de depuração longas. O Bridge to Kubernetes lida com resolução DNS e injeção de variáveis de ambiente automaticamente.

## Build de container

### Boas práticas de Dockerfile

Use multi-stage builds. Execute como non-root. Mantenha as imagens pequenas.

```dockerfile
# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
RUN adduser --disabled-password --gecos "" appuser
USER appuser
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENTRYPOINT ["dotnet", "MyService.dll"]
```

Sempre crie um arquivo `.dockerignore`:

```text
.git
.github
node_modules
bin
obj
*.md
docker-compose*.yml
```

:::warning

Nunca execute containers como root em produção. Se sua imagem base usa root como padrão, adicione uma diretiva `USER`. Clusters AKS com Azure Policy ou OPA Gatekeeper rejeitarão pods executando como root.

:::

### ACR Build

Construa imagens na nuvem com Azure Container Registry Build Tasks. Isso elimina a necessidade de um Docker daemon local no CI e evita problemas de "funciona na minha máquina".

```bash
# One-time build
az acr build --registry <acr-name> --image myservice:v1.2.3 .

# Set up a recurring build task triggered by git push
az acr task create \
  --registry <acr-name> \
  --name build-myservice \
  --image myservice:{{.Run.ID}} \
  --context https://github.com/<org>/<repo>.git \
  --file Dockerfile \
  --git-access-token <pat>
```

### Estratégia de tags de imagem

Não use `:latest`. Nunca. Isso torna rollbacks impossíveis e a depuração um pesadelo.

| Estratégia | Formato | Quando usar |
|---|---|---|
| Git SHA | `myservice:abc1234` | Escolha padrão. Cada imagem rastreia de volta a um commit. |
| Semver | `myservice:1.2.3` | Quando publica releases versionados. |
| Git SHA + semver | `myservice:1.2.3-abc1234` | Quando precisa de rastreabilidade e semântica de versão. |

```bash
# Tag with short git SHA
GIT_SHA=$(git rev-parse --short HEAD)
docker build -t myacr.azurecr.io/myservice:${GIT_SHA} .
```

## Artefatos de deployment

### Helm vs Kustomize

Use Helm para charts de terceiros (ingress-nginx, cert-manager, Prometheus). Use Kustomize para seus próprios aplicativos.

| | Helm | Kustomize |
|---|---|---|
| Melhor para | Software de terceiros que você instala | Seus próprios serviços que você constrói |
| Templating | Go templates, complexo mas poderoso | Patches e overlays, simples e previsível |
| Curva de aprendizado | Íngreme | Suave |
| Quando evitar | Quando se encontrar escrevendo blocos `{{ if }}` para seu próprio app | Quando precisar de lógica condicional ou loops |

:::info

Se sua equipe já usa Helm para tudo e funciona, continue usando. Migrar para Kustomize por si só não vale o esforço. Esta recomendação é para projetos novos.

:::

### Recursos essenciais do Kubernetes

Todo serviço em produção precisa destes cinco recursos no mínimo:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myservice
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myservice
  template:
    metadata:
      labels:
        app: myservice
    spec:
      containers:
        - name: myservice
          image: myacr.azurecr.io/myservice:abc1234
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 20
---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: myservice
spec:
  selector:
    app: myservice
  ports:
    - port: 80
      targetPort: 8080
---
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myservice
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myservice
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
---
# pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myservice
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: myservice
```

### ConfigMaps e Secrets

Use ConfigMaps para configurações não sensíveis. Use Kubernetes Secrets com suporte do Azure Key Vault para valores sensíveis.

```bash
# Create a ConfigMap from a file
kubectl create configmap myservice-config --from-file=config.yaml -n <namespace>

# Reference secrets from Key Vault using the CSI driver
# See the workload-identity guide for setup
```

Não incorpore configurações na imagem do container. Não armazene secrets em ConfigMaps. Não faça commit de secrets no git.

## Autenticação com serviços Azure

### Workload Identity

Use Workload Identity. É o único método suportado para autenticação pod-para-serviço-Azure. Não use managed pod identity (descontinuado) ou secrets de service principal.

```csharp
// In your application code, use DefaultAzureCredential
// It automatically picks up the Workload Identity token
var credential = new DefaultAzureCredential();
var blobClient = new BlobServiceClient(
    new Uri("https://mystorage.blob.core.windows.net"),
    credential);
```

```python
# Python equivalent
from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient

credential = DefaultAzureCredential()
blob_service = BlobServiceClient(
    account_url="https://mystorage.blob.core.windows.net",
    credential=credential)
```

:::info

`DefaultAzureCredential` funciona tanto localmente (usando seu login do Azure CLI) quanto no AKS (usando o token do Workload Identity). Você não precisa de código de credencial específico por ambiente.

:::

## Pipeline CI/CD

### GitHub Actions

Um pipeline mínimo que builda seu container, faz push para o ACR e faz deploy no AKS. Usa Workload Identity (credenciais federadas) para autenticação — nenhum secret armazenado no GitHub.

**Pré-requisitos:**
1. Um app registration no Azure AD com credencial federada confiando no seu repositório GitHub
2. O app deve ter a role `AcrPush` no ACR e `Azure Kubernetes Service Cluster User Role` no cluster
3. Secrets no repositório GitHub: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

env:
  ACR_NAME: myacr
  CLUSTER_NAME: mycluster
  RESOURCE_GROUP: myrg
  NAMESPACE: production

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # Necessário para federação Workload Identity
      contents: read
    steps:
      - uses: actions/checkout@v4

      # Autenticar no Azure usando Workload Identity (OIDC) -- sem secrets
      - name: Azure login
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      # Buildar a imagem do container no ACR (sem Docker local)
      - name: Build and push to ACR
        run: |
          az acr build \
            --registry ${{ env.ACR_NAME }} \
            --image myservice:${{ github.sha }} .

      # Obter credenciais do cluster para kubectl
      - name: Set AKS context
        uses: azure/aks-set-context@v4
        with:
          resource-group: ${{ env.RESOURCE_GROUP }}
          cluster-name: ${{ env.CLUSTER_NAME }}

      # Atualizar a imagem do deployment e aguardar o rollout
      - name: Deploy to AKS
        run: |
          kubectl set image deployment/myservice \
            myservice=${{ env.ACR_NAME }}.azurecr.io/myservice:${{ github.sha }} \
            -n ${{ env.NAMESPACE }}
          kubectl rollout status deployment/myservice -n ${{ env.NAMESPACE }} --timeout=300s
```

:::tip

Use `az acr build` ao invés de buildar localmente e fazer push. Ele builda na nuvem, elimina a complexidade do Docker-in-Docker e funciona em qualquer CI runner sem Docker instalado.
:::

**O que esse pipeline faz passo a passo:**
1. Dispara em cada push para `main`
2. Autentica no Azure usando federação OIDC (sem credenciais armazenadas)
3. Builda a imagem do container diretamente no ACR usando `az acr build`
4. Conecta ao cluster AKS
5. Atualiza o Deployment com a nova tag da imagem (git SHA)
6. Aguarda o rollout completar (falha o pipeline se o rollout falhar)

### GitOps com Flux

Se sua equipe usa GitOps, envie manifests para um repositório de configuração e deixe o Flux lidar com o deployment. Isso fornece um rastro de auditoria e rollbacks fáceis via git revert.

```bash
# Install Flux on the cluster
az k8s-configuration flux create \
  --resource-group <rg> \
  --cluster-name <cluster> \
  --cluster-type managedClusters \
  --name myapp-config \
  --namespace flux-system \
  --scope cluster \
  --url https://github.com/<org>/<config-repo> \
  --branch main \
  --kustomization name=app path=./clusters/production prune=true
```

## Depuração no AKS

### Comandos básicos

```bash
# View logs (last 100 lines, follow mode)
kubectl logs <pod-name> -n <namespace> --tail=100 -f

# View logs for a crashed container (previous instance)
kubectl logs <pod-name> -n <namespace> --previous

# Describe a pod to see events and conditions
kubectl describe pod <pod-name> -n <namespace>

# Exec into a running container
kubectl exec -it <pod-name> -n <namespace> -- /bin/sh
```

### Containers de depuração efêmeros

Quando seu container não inclui um shell (imagens distroless, imagens baseadas em scratch), use containers de depuração efêmeros:

```bash
# Attach a debug container with common tools
kubectl debug -it <pod-name> -n <namespace> \
  --image=mcr.microsoft.com/dotnet/runtime-deps:8.0 \
  --target=myservice
```

### Container Insights live logs

Para logs sem acesso `kubectl`, use o portal Azure:

1. Vá ao seu recurso AKS.
2. Selecione **Monitoring > Logs > Live data**.
3. Selecione o namespace e o pod.

Isso é útil quando seu contexto kubectl está quebrado ou quando pessoas que não são desenvolvedores precisam visualizar logs.

## Erros comuns de desenvolvedores

| Erro | Consequência | Correção |
|---|---|---|
| Não definir resource requests/limits | Pods são despejados de forma imprevisível, não conseguem fazer autoscale | Sempre defina `requests` e `limits` no spec do deployment |
| Usar a tag `:latest` | Não consegue fazer rollback, não sabe qual versão está rodando | Use tags de git SHA ou semver |
| Hardcoding de configuração | Requer uma nova imagem para cada mudança de configuração | Use ConfigMaps e variáveis de ambiente |
| Não adicionar health probes | Kubernetes roteia tráfego para pods quebrados | Adicione `readinessProbe` e `livenessProbe` |
| Não adicionar PDB | Atualizações e drenos de nó matam todas as réplicas de uma vez | Adicione um `PodDisruptionBudget` com `minAvailable` |
| Logar em arquivos em vez de stdout | Container Insights não consegue coletar os logs | Escreva logs em stdout/stderr, não em arquivos |
| Não definir `imagePullPolicy` | Imagens em cache desatualizadas rodam em vez das novas | Defina `imagePullPolicy: IfNotPresent` e use tags únicas |

:::warning

Se você não definir resource requests, o scheduler do Kubernetes trata seu pod como best-effort. Ele será o primeiro a ser despejado quando o nó ficar sem memória. Sempre defina pelo menos `requests` — até uma estimativa aproximada é melhor que nada.

:::

## Recursos

- [AKS developer best practices](https://learn.microsoft.com/en-us/azure/aks/best-practices)
- [Workload Identity overview](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [ACR Build Tasks](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-tutorial-build-task)
- [Flux GitOps on AKS](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/tutorial-use-gitops-flux2)
- [Bridge to Kubernetes](https://learn.microsoft.com/en-us/visualstudio/bridge/overview-bridge-to-kubernetes)
- [Ephemeral debug containers](https://learn.microsoft.com/en-us/azure/aks/developer-best-practices-pod-security#use-ephemeral-containers-for-debugging)
- [Container Insights for AKS](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-overview)
