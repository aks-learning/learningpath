---
sidebar_position: 2
title: "Developer workflow"
description: "End-to-end guide for developers shipping services to AKS: from local development to production deployment."
---

# Developer workflow

You are a developer shipping a service to AKS. You do not need to understand cluster networking, node pools, or Kubernetes internals. This guide covers exactly what you need: build, deploy, debug, repeat.

## Local development

### Container runtime

Use Docker Desktop or Podman to run containers locally. Do not develop against a shared cluster for inner-loop work — it is slow and creates conflicts with other developers.

| Tool | When to use |
|---|---|
| Docker Desktop | Default choice. Works on macOS, Windows, Linux. Built-in Kubernetes. |
| Podman | When you need a daemonless, rootless alternative. Good for CI runners and restricted environments. |

### Inner-loop development

Use Tilt or Skaffold to get hot-reload against a local Kubernetes cluster. Do not manually run `docker build` and `kubectl apply` in a loop — it wastes time and you will forget steps.

```bash
# Tilt — define a Tiltfile in your repo root
tilt up

# Skaffold — define skaffold.yaml in your repo root
skaffold dev
```

:::tip

Tilt is the better choice if your team runs multiple services locally. It handles multi-service orchestration with a dashboard that shows build and runtime status in one place. Skaffold is simpler for single-service development.

:::

### Bridge to Kubernetes

When you need to debug against a service that only exists in the cluster (a database, a message queue, an upstream API), use Bridge to Kubernetes. It routes traffic from the remote cluster to your local machine.

```bash
# Install the VS Code extension: "Bridge to Kubernetes"
# Or use the CLI
bridge-to-kubernetes connect --service <service-name> --namespace <namespace>
```

Do not use port-forwarding for long debugging sessions. Bridge to Kubernetes handles DNS resolution and environment variable injection automatically.

## Container build

### Dockerfile best practices

Use multi-stage builds. Run as non-root. Keep images small.

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

Always create a `.dockerignore` file:

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

Never run containers as root in production. If your base image defaults to root, add a `USER` directive. AKS clusters with Azure Policy or OPA Gatekeeper will reject pods running as root.

:::

### ACR Build

Build images in the cloud with Azure Container Registry Build Tasks. This removes the need for a local Docker daemon in CI and avoids "works on my machine" issues.

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

### Image tagging strategy

Do not use `:latest`. Ever. It makes rollbacks impossible and debugging a nightmare.

| Strategy | Format | When to use |
|---|---|---|
| Git SHA | `myservice:abc1234` | Default choice. Every image traces back to a commit. |
| Semver | `myservice:1.2.3` | When you publish versioned releases. |
| Git SHA + semver | `myservice:1.2.3-abc1234` | When you need both traceability and version semantics. |

```bash
# Tag with short git SHA
GIT_SHA=$(git rev-parse --short HEAD)
docker build -t myacr.azurecr.io/myservice:${GIT_SHA} .
```

## Deployment artifacts

### Helm vs Kustomize

Use Helm for third-party charts (ingress-nginx, cert-manager, Prometheus). Use Kustomize for your own applications.

| | Helm | Kustomize |
|---|---|---|
| Best for | Third-party software you install | Your own services you build |
| Templating | Go templates, complex but powerful | Patches and overlays, simple and predictable |
| Learning curve | Steep | Shallow |
| When to avoid | When you find yourself writing `{{ if }}` blocks for your own app | When you need conditional logic or loops |

:::info

If your team already uses Helm for everything and it works, keep using it. Migrating to Kustomize for the sake of it is not worth the effort. This recommendation is for new projects.

:::

### Essential Kubernetes resources

Every production service needs these five resources at minimum:

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

### ConfigMaps and Secrets

Use ConfigMaps for non-sensitive configuration. Use Kubernetes Secrets backed by Azure Key Vault for sensitive values.

```bash
# Create a ConfigMap from a file
kubectl create configmap myservice-config --from-file=config.yaml -n <namespace>

# Reference secrets from Key Vault using the CSI driver
# See the workload-identity guide for setup
```

Do not bake configuration into your container image. Do not store secrets in ConfigMaps. Do not commit secrets to git.

## Authentication to Azure services

### Workload Identity

Use Workload Identity. It is the only supported method for pod-to-Azure-service authentication. Do not use managed pod identity (deprecated) or service principal secrets.

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

`DefaultAzureCredential` works both locally (using your Azure CLI login) and in AKS (using the Workload Identity token). You do not need environment-specific credential code.

:::

## CI/CD pipeline

### GitHub Actions

A minimal pipeline that builds your container, pushes to ACR, and deploys to AKS. Uses Workload Identity (federated credentials) for authentication — no secrets stored in GitHub.

**Prerequisites:**
1. An Azure AD app registration with federated credential trusting your GitHub repo
2. The app must have `AcrPush` role on your ACR and `Azure Kubernetes Service Cluster User Role` on the cluster
3. GitHub repository secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`

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
      id-token: write   # Required for Workload Identity federation
      contents: read
    steps:
      - uses: actions/checkout@v4

      # Authenticate to Azure using Workload Identity (OIDC) -- no secrets
      - name: Azure login
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      # Build the container image in ACR (no local Docker needed)
      - name: Build and push to ACR
        run: |
          az acr build \
            --registry ${{ env.ACR_NAME }} \
            --image myservice:${{ github.sha }} .

      # Get cluster credentials for kubectl
      - name: Set AKS context
        uses: azure/aks-set-context@v4
        with:
          resource-group: ${{ env.RESOURCE_GROUP }}
          cluster-name: ${{ env.CLUSTER_NAME }}

      # Update the deployment image and wait for rollout
      - name: Deploy to AKS
        run: |
          kubectl set image deployment/myservice \
            myservice=${{ env.ACR_NAME }}.azurecr.io/myservice:${{ github.sha }} \
            -n ${{ env.NAMESPACE }}
          kubectl rollout status deployment/myservice -n ${{ env.NAMESPACE }} --timeout=300s
```

:::tip

Use `az acr build` instead of building locally and pushing. It builds in the cloud, eliminates Docker-in-Docker complexity, and works from any CI runner without Docker installed.
:::

**What this pipeline does step by step:**
1. Triggers on every push to `main`
2. Authenticates to Azure using OIDC federation (no stored credentials)
3. Builds the container image directly in ACR using `az acr build`
4. Connects to the AKS cluster
5. Updates the Deployment with the new image tag (git SHA)
6. Waits for the rollout to complete (fails the pipeline if rollout fails)

### GitOps with Flux

If your team uses GitOps, push manifests to a config repository and let Flux handle deployment. This gives you an audit trail and easy rollbacks via git revert.

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

## Debugging in AKS

### Basic commands

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

### Ephemeral debug containers

When your container does not include a shell (distroless images, scratch-based images), use ephemeral debug containers:

```bash
# Attach a debug container with common tools
kubectl debug -it <pod-name> -n <namespace> \
  --image=mcr.microsoft.com/dotnet/runtime-deps:8.0 \
  --target=myservice
```

### Container Insights live logs

For logs without `kubectl` access, use the Azure portal:

1. Go to your AKS resource.
2. Select **Monitoring > Logs > Live data**.
3. Select the namespace and pod.

This is useful when your kubectl context is broken or when non-developers need to view logs.

## Common developer mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Not setting resource requests/limits | Pods get evicted unpredictably, cannot autoscale | Always set `requests` and `limits` in your deployment spec |
| Using `:latest` tag | Cannot roll back, cannot tell which version is running | Use git SHA or semver tags |
| Hardcoding config | Requires a new image for every config change | Use ConfigMaps and environment variables |
| Not adding health probes | Kubernetes routes traffic to broken pods | Add `readinessProbe` and `livenessProbe` |
| Not adding PDB | Upgrades and node drains kill all replicas at once | Add a `PodDisruptionBudget` with `minAvailable` |
| Logging to files instead of stdout | Container Insights cannot collect logs | Write logs to stdout/stderr, not files |
| Not setting `imagePullPolicy` | Stale cached images run instead of new ones | Set `imagePullPolicy: IfNotPresent` and use unique tags |

:::warning

If you skip resource requests, the Kubernetes scheduler treats your pod as best-effort. It will be the first to get evicted when the node runs out of memory. Always set at least `requests` — even a rough estimate is better than nothing.

:::

## Resources

- [AKS developer best practices](https://learn.microsoft.com/en-us/azure/aks/best-practices)
- [Workload Identity overview](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- [ACR Build Tasks](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-tutorial-build-task)
- [Flux GitOps on AKS](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/tutorial-use-gitops-flux2)
- [Bridge to Kubernetes](https://learn.microsoft.com/en-us/visualstudio/bridge/overview-bridge-to-kubernetes)
- [Ephemeral debug containers](https://learn.microsoft.com/en-us/azure/aks/developer-best-practices-pod-security#use-ephemeral-containers-for-debugging)
- [Container Insights for AKS](https://learn.microsoft.com/en-us/azure/azure-monitor/containers/container-insights-overview)
