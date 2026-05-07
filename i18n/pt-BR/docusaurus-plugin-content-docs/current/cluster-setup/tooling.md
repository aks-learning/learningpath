---
sidebar_position: 2
title: "Ferramentas Essenciais"
description: "As ferramentas que voce realmente precisa para gerenciar clusters AKS, e quais pular"
---

# Ferramentas Essenciais

kubectl + kubelogin + helm e o minimo. Adicione k9s para debugging interativo. Pule GUIs ate saber usar a CLI.

## Ferramentas Obrigatorias

Instale estas antes de tocar em qualquer cluster AKS:

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

| Ferramenta | Por que Voce Precisa | Instalacao |
|------------|---------------------|------------|
| **Azure CLI** | Gerenciamento do ciclo de vida do cluster | `winget install Microsoft.AzureCLI` |
| **kubectl** | Todas as interacoes com a API do Kubernetes | `az aks install-cli` |
| **kubelogin** | Obrigatorio para autenticacao via Entra ID (todo cluster de producao) | `az aks install-cli` |
| **Helm** | Instalar componentes de terceiros (ingress, cert-manager) | `winget install Helm.Helm` |

:::warning

kubelogin nao e opcional. Todo cluster AKS de producao usa integracao com Entra ID. Sem kubelogin, o kubectl nao consegue autenticar. O comando `az aks install-cli` instala tanto o kubectl quanto o kubelogin.
:::

## Conectando ao Seu Cluster

```bash
# Get credentials (merges into ~/.kube/config)
az aks get-credentials --resource-group myrg --name myaks

# For Entra ID clusters, convert kubeconfig to use kubelogin
kubelogin convert-kubeconfig -l azurecli

# Verify connectivity
kubectl get nodes
```

## Recomendadas (Nao Obrigatorias)

| Ferramenta | Finalidade | Opiniao |
|------------|-----------|---------|
| **k9s** | Interface de terminal para Kubernetes | Melhor ferramenta de debugging. Ganha de loops de `kubectl get`. |
| **Kustomize** | Composicao de YAML sem templates | Integrado ao kubectl (`kubectl apply -k`) |
| **kubectx/kubens** | Troca rapida de contexto/namespace | Essencial quando voce tem 2+ clusters |
| **stern** | Tail de logs em multiplos pods | `kubectl logs` mas em todos os pods de uma vez |

```bash
# Install k9s
winget install derailed.k9s

# Run it -- instant cluster overview
k9s
```

## Helm vs Kustomize

Use Helm para charts de terceiros. Use Kustomize para suas proprias aplicacoes. Nao use ambos na mesma aplicacao.

| Cenario | Use | Por que |
|---------|-----|---------|
| Instalar NGINX Ingress Controller | Helm | Chart mantido, templates complexos, configuracao via values |
| Instalar cert-manager | Helm | Mesmo caso |
| Deploy do seu proprio microservico | Kustomize | Overlays simples, sem necessidade de template engine |
| Customizar muito um Helm chart | Helm + arquivo de values | Nao ejete para patches do Kustomize em cima do Helm |

:::tip Opiniao

Se voce esta fazendo patch do output do Helm com Kustomize, voce errou. Ou use o values.yaml do chart corretamente ou faca fork do chart. O pipeline Helm-e-depois-Kustomize e um pesadelo de manutencao.
:::

## Infraestrutura como Codigo

| Ferramenta | Quando Usar |
|------------|-------------|
| **Bicep** | Times somente Azure, sintaxe mais simples, suporte first-party |
| **Terraform** | Requisito multi-cloud, estate Terraform existente |
| **ARM Templates** | Nunca para projetos novos. Apenas legado. |

:::info

Bicep compila para ARM mas e legivel por humanos. Se voce e somente Azure, use Bicep. Terraform faz sentido se voce tambem gerencia recursos AWS/GCP ou se seu time ja o conhece.
:::

## Pule Estes (Por Enquanto)

- **Lens/OpenLens**: IDE GUI para Kubernetes. Aprenda kubectl primeiro para entender o que a GUI esta fazendo.
- **Docker Desktop Kubernetes**: Use AKS diretamente ou kind/minikube para dev local.
- **Rancher/Portainer**: Adiciona uma camada de gerenciamento que voce nao precisa para um unico cluster.

## Recursos

- [Comandos AKS da Azure CLI](https://learn.microsoft.com/cli/azure/aks)
- [Documentacao do kubelogin](https://azure.github.io/kubelogin/)
- [Quickstart do Helm](https://helm.sh/docs/intro/quickstart/)
- [k9s - interface de terminal](https://k9scli.io/)
