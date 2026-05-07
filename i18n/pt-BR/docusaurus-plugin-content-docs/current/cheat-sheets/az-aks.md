---
sidebar_position: 2
title: "Cheat sheet az aks"
description: "Referência rápida de comandos Azure CLI para gerenciar clusters AKS, node pools, upgrades e add-ons."
---

# Cheat sheet az aks

Todos os comandos `az aks` que você precisa para ciclo de vida do cluster, gerenciamento de node pools, upgrades e configuração de add-ons. Copie, cole e modifique o resource group e o nome do cluster.

## Ciclo de vida do cluster

```bash
# Create a production cluster (AKS Base)
az aks create \
  --resource-group myRG \
  --name myAKS \
  --sku base \
  --location eastus \
  --node-count 3 \
  --node-vm-size Standard_D4s_v5 \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --enable-oidc-issuer \
  --enable-workload-identity \
  --enable-managed-identity \
  --zones 1 2 3 \
  --generate-ssh-keys

# Create an AKS Automatic cluster
az aks create \
  --resource-group myRG \
  --name myAKS \
  --sku automatic \
  --location eastus

# Get cluster credentials
az aks get-credentials --resource-group myRG --name myAKS

# Get credentials for admin (emergency only)
az aks get-credentials --resource-group myRG --name myAKS --admin

# Show cluster details
az aks show --resource-group myRG --name myAKS -o table

# Delete cluster
az aks delete --resource-group myRG --name myAKS --yes --no-wait
```

## Operações de node pool

```bash
# List node pools
az aks nodepool list --resource-group myRG --cluster-name myAKS -o table

# Add a user node pool
az aks nodepool add \
  --resource-group myRG \
  --cluster-name myAKS \
  --name workload1 \
  --node-count 3 \
  --node-vm-size Standard_D4s_v5 \
  --zones 1 2 3 \
  --mode User

# Add a spot node pool (for batch/non-critical workloads)
az aks nodepool add \
  --resource-group myRG \
  --cluster-name myAKS \
  --name spot01 \
  --node-vm-size Standard_D4s_v5 \
  --priority Spot \
  --eviction-policy Delete \
  --spot-max-price -1 \
  --enable-cluster-autoscaler \
  --min-count 0 \
  --max-count 10

# Enable autoscaler on existing pool
az aks nodepool update \
  --resource-group myRG \
  --cluster-name myAKS \
  --name workload1 \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 10

# Scale a node pool manually
az aks nodepool scale \
  --resource-group myRG \
  --cluster-name myAKS \
  --name workload1 \
  --node-count 5

# Delete a node pool
az aks nodepool delete \
  --resource-group myRG \
  --cluster-name myAKS \
  --name oldpool \
  --no-wait
```

## Upgrades

```bash
# Check available Kubernetes versions
az aks get-versions --location eastus -o table

# Check current cluster version and available upgrades
az aks show --resource-group myRG --name myAKS \
  --query "{currentVersion:kubernetesVersion, upgrades:agentPoolProfiles[0].upgradeSettings}" -o table

# Upgrade cluster control plane only
az aks upgrade \
  --resource-group myRG \
  --name myAKS \
  --kubernetes-version 1.30.0 \
  --control-plane-only

# Upgrade a specific node pool
az aks nodepool upgrade \
  --resource-group myRG \
  --cluster-name myAKS \
  --name workload1 \
  --kubernetes-version 1.30.0

# Set auto-upgrade channel
az aks update \
  --resource-group myRG \
  --name myAKS \
  --auto-upgrade-channel stable

# Set node OS upgrade channel
az aks update \
  --resource-group myRG \
  --name myAKS \
  --node-os-upgrade-channel NodeImage

# Set maintenance window
az aks maintenancewindow add \
  --resource-group myRG \
  --cluster-name myAKS \
  --name default \
  --schedule-type Weekly \
  --day-of-week Tuesday \
  --start-time 02:00 \
  --duration 4
```

## Rede

```bash
# Enable Azure CNI Overlay + Cilium on new cluster
az aks create \
  --resource-group myRG \
  --name myAKS \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --pod-cidr 10.244.0.0/16

# Create a private cluster
az aks create \
  --resource-group myRG \
  --name myAKS \
  --enable-private-cluster \
  --private-dns-zone system

# Check FQDN / API server address
az aks show --resource-group myRG --name myAKS \
  --query "{fqdn:fqdn, privateFqdn:privateFqdn, apiServerAccessProfile:apiServerAccessProfile}" -o json

# Authorize an IP range to access the API server
az aks update \
  --resource-group myRG \
  --name myAKS \
  --api-server-authorized-ip-ranges "203.0.113.0/24"
```

## Identidade e segurança

```bash
# Enable Workload Identity
az aks update \
  --resource-group myRG \
  --name myAKS \
  --enable-oidc-issuer \
  --enable-workload-identity

# Get OIDC issuer URL
az aks show --resource-group myRG --name myAKS \
  --query "oidcIssuerProfile.issuerUrl" -o tsv

# Enable Azure Policy
az aks enable-addons \
  --resource-group myRG \
  --name myAKS \
  --addons azure-policy

# Enable Defender for Containers
az aks update \
  --resource-group myRG \
  --name myAKS \
  --enable-defender

# Enable Image Cleaner (remove stale images from nodes)
az aks update \
  --resource-group myRG \
  --name myAKS \
  --enable-image-cleaner \
  --image-cleaner-interval-hours 24
```

## Observabilidade

```bash
# Enable Container Insights
az aks enable-addons \
  --resource-group myRG \
  --name myAKS \
  --addons monitoring \
  --workspace-resource-id "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.OperationalInsights/workspaces/<workspace>"

# Enable Managed Prometheus + Grafana
az aks update \
  --resource-group myRG \
  --name myAKS \
  --enable-azure-monitor-metrics

# Enable cost analysis add-on
az aks update \
  --resource-group myRG \
  --name myAKS \
  --enable-cost-analysis

# Check add-on status
az aks show --resource-group myRG --name myAKS \
  --query "addonProfiles" -o json
```

## Integração com ACR

```bash
# Attach ACR to cluster (grant AcrPull)
az aks update \
  --resource-group myRG \
  --name myAKS \
  --attach-acr myACR

# Check ACR integration status
az aks check-acr \
  --resource-group myRG \
  --name myAKS \
  --acr myACR.azurecr.io

# Import an image to ACR (faster than docker push)
az acr import \
  --name myACR \
  --source docker.io/library/nginx:1.27 \
  --image nginx:1.27
```

## Diagnósticos do cluster

```bash
# Run AKS diagnostics
az aks kollect \
  --resource-group myRG \
  --name myAKS \
  --storage-account myStorageAccount

# Get cluster health
az aks show --resource-group myRG --name myAKS \
  --query "{powerState:powerState, provisioningState:provisioningState}" -o json

# Start / stop cluster (dev/test cost savings)
az aks stop --resource-group myRG --name myAKS
az aks start --resource-group myRG --name myAKS

# List operations on the cluster
az aks operation-abort --resource-group myRG --name myAKS 2>/dev/null
```

## GitOps (Flux)

```bash
# Install Flux extension
az k8s-extension create \
  --resource-group myRG \
  --cluster-name myAKS \
  --cluster-type managedClusters \
  --name flux \
  --extension-type microsoft.flux

# Create a Flux configuration
az k8s-configuration flux create \
  --resource-group myRG \
  --cluster-name myAKS \
  --cluster-type managedClusters \
  --name my-app \
  --namespace flux-system \
  --scope cluster \
  --url https://github.com/myorg/my-k8s-config \
  --branch main \
  --kustomization name=infra path=./infrastructure prune=true \
  --kustomization name=apps path=./apps prune=true dependsOn=infra
```

## Recursos

- [Referência az aks](https://learn.microsoft.com/en-us/cli/azure/aks)
- [Referência az aks nodepool](https://learn.microsoft.com/en-us/cli/azure/aks/nodepool)
- [Versões do Kubernetes suportadas no AKS](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions)
