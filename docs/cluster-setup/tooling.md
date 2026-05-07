---
sidebar_position: 2
title: "Essential Tools"
description: "The tools you actually need to manage AKS clusters, and which ones to skip"
---

# Essential Tools

kubectl + kubelogin + helm is the minimum. Add k9s for interactive debugging. Skip GUIs until you know the CLI.

## Required Tools

Install these before touching any AKS cluster:

```bash
# Install Azure CLI (includes az aks commands)
# Windows: winget install Microsoft.AzureCLI
# macOS: brew install azure-cli
# Linux: curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Install kubectl and kubelogin via Azure CLI
az aks install-cli

# Verify installations
kubectl version --client
kubelogin --version
helm version
```

| Tool | Why You Need It | Install |
|------|----------------|---------|
| **Azure CLI** | Cluster lifecycle management | `winget install Microsoft.AzureCLI` |
| **kubectl** | All Kubernetes API interactions | `az aks install-cli` |
| **kubelogin** | Required for Entra ID auth (every production cluster) | `az aks install-cli` |
| **Helm** | Install third-party components (ingress, cert-manager) | `winget install Helm.Helm` |

:::warning

kubelogin is not optional. Every production AKS cluster uses Entra ID integration. Without kubelogin, kubectl cannot authenticate. The `az aks install-cli` command installs both kubectl and kubelogin.
:::

## Connecting to Your Cluster

```bash
# Get credentials (merges into ~/.kube/config)
az aks get-credentials --resource-group myrg --name myaks

# For Entra ID clusters, convert kubeconfig to use kubelogin
kubelogin convert-kubeconfig -l azurecli

# Verify connectivity
kubectl get nodes
```

## Recommended (Not Required)

| Tool | Purpose | Opinion |
|------|---------|---------|
| **k9s** | Terminal UI for Kubernetes | Best debugging tool. Beats `kubectl get` loops. |
| **Kustomize** | Template-free YAML composition | Built into kubectl (`kubectl apply -k`) |
| **kubectx/kubens** | Fast context/namespace switching | Essential once you have 2+ clusters |
| **stern** | Multi-pod log tailing | `kubectl logs` but across all pods at once |

```bash
# Install k9s
winget install derailed.k9s

# Run it -- instant cluster overview
k9s
```

## Helm vs Kustomize

Use Helm for third-party charts. Use Kustomize for your own apps. Don't use both on the same application.

| Scenario | Use | Why |
|----------|-----|-----|
| Install NGINX Ingress Controller | Helm | Maintained chart, complex templates, values-based config |
| Install cert-manager | Helm | Same as above |
| Deploy your own microservice | Kustomize | Simple overlays, no template engine needed |
| Customize a Helm chart heavily | Helm + values file | Don't eject into Kustomize patches on top of Helm |

:::tip Opinion

If you find yourself patching Helm output with Kustomize, you've gone wrong. Either use the chart's values.yaml properly or fork the chart. The Helm-then-Kustomize pipeline is a maintenance nightmare.
:::

## Infrastructure as Code

| Tool | When to Use |
|------|-------------|
| **Bicep** | Azure-only shops, simplest syntax, first-party support |
| **Terraform** | Multi-cloud requirement, existing Terraform estate |
| **ARM Templates** | Never for new projects. Legacy only. |

:::info

Bicep compiles to ARM but is human-readable. If you're Azure-only, use Bicep. Terraform makes sense if you also manage AWS/GCP resources or your team already knows it.
:::

## Skip These (For Now)

- **Lens/OpenLens**: GUI Kubernetes IDE. Learn kubectl first so you understand what the GUI is doing.
- **Docker Desktop Kubernetes**: Use AKS directly or kind/minikube for local dev.
- **Rancher/Portainer**: Adds a management layer you don't need for a single cluster.

## Resources

- [Azure CLI AKS commands](https://learn.microsoft.com/cli/azure/aks)
- [kubelogin documentation](https://azure.github.io/kubelogin/)
- [Helm quickstart](https://helm.sh/docs/intro/quickstart/)
- [k9s terminal UI](https://k9scli.io/)
