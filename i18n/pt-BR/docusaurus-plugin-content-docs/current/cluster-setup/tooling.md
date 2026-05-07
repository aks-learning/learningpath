---
sidebar_position: 2
title: "Ferramentas Essenciais"
description: "As ferramentas que você realmente precisa para gerenciar clusters AKS, e quais pular"
---

# Ferramentas essenciais

kubectl + kubelogin + helm é o mínimo. Adicione k9s para debugging interativo. Pule GUIs até saber usar a CLI.

## Ferramentas obrigatórias

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

| Ferramenta | Por que Você Precisa | Instalação |
|------------|---------------------|------------|
| **Azure CLI** | Gerenciamento do ciclo de vida do cluster | `winget install Microsoft.AzureCLI` |
| **kubectl** | Todas as interações com a API do Kubernetes | `az aks install-cli` |
| **kubelogin** | Obrigatório para autenticação via Entra ID (todo cluster de produção) | `az aks install-cli` |
| **Helm** | Instalar componentes de terceiros (ingress, cert-manager) | `winget install Helm.Helm` |

:::warning

kubelogin não é opcional. Todo cluster AKS de produção usa integração com Entra ID. Sem kubelogin, o kubectl não consegue autenticar. O comando `az aks install-cli` instala tanto o kubectl quanto o kubelogin.
:::

## Conectando ao seu cluster

```bash
# Get credentials (merges into ~/.kube/config)
az aks get-credentials --resource-group myrg --name myaks

# For Entra ID clusters, convert kubeconfig to use kubelogin
kubelogin convert-kubeconfig -l azurecli

# Verify connectivity
kubectl get nodes
```

## Recomendadas (não obrigatórias)

| Ferramenta | Finalidade | Opinião |
|------------|-----------|---------|
| **k9s** | Interface de terminal para Kubernetes | Melhor ferramenta de debugging. Ganha de loops de `kubectl get`. |
| **Kustomize** | Composição de YAML sem templates | Integrado ao kubectl (`kubectl apply -k`) |
| **kubectx/kubens** | Troca rápida de contexto/namespace | Essencial quando você tem 2+ clusters |
| **stern** | Tail de logs em múltiplos pods | `kubectl logs` mas em todos os pods de uma vez |

```bash
# Install k9s
winget install derailed.k9s

# Run it -- instant cluster overview
k9s
```

## Helm vs Kustomize

Use Helm para charts de terceiros. Use Kustomize para suas próprias aplicações. Não use ambos na mesma aplicação.

| Cenário | Use | Por que |
|---------|-----|---------|
| Instalar NGINX Ingress Controller | Helm | Chart mantido, templates complexos, configuração via values |
| Instalar cert-manager | Helm | Mesmo caso |
| Deploy do seu próprio microsserviço | Kustomize | Overlays simples, sem necessidade de template engine |
| Customizar muito um Helm chart | Helm + arquivo de values | Não ejete para patches do Kustomize em cima do Helm |

:::tip Opinião

Se você está fazendo patch do output do Helm com Kustomize, você errou. Ou use o values.yaml do chart corretamente ou faça fork do chart. O pipeline Helm-e-depois-Kustomize é um pesadelo de manutenção.
:::

## Infraestrutura como código

| Ferramenta | Quando Usar |
|------------|-------------|
| **Bicep** | Times somente Azure, sintaxe mais simples, suporte first-party |
| **Terraform** | Requisito multi-cloud, estate Terraform existente |
| **ARM Templates** | Nunca para projetos novos. Apenas legado. |

:::info

Bicep compila para ARM mas é legível por humanos. Se você é somente Azure, use Bicep. Terraform faz sentido se você também gerencia recursos AWS/GCP ou se seu time já o conhece.
:::

## Pule estes (por enquanto)

- **Lens/OpenLens**: IDE GUI para Kubernetes. Aprenda kubectl primeiro para entender o que a GUI está fazendo.
- **Docker Desktop Kubernetes**: Use AKS diretamente ou kind/minikube para dev local.
- **Rancher/Portainer**: Adiciona uma camada de gerenciamento que você não precisa para um único cluster.

## Recursos

- [Comandos AKS da Azure CLI](https://learn.microsoft.com/cli/azure/aks)
- [Documentação do kubelogin](https://azure.github.io/kubelogin/)
- [Quickstart do Helm](https://helm.sh/docs/intro/quickstart/)
- [k9s - interface de terminal](https://k9scli.io/)
