---
sidebar_position: 1
title: "CI/CD para AKS"
description: "Modelos de entrega push-based vs pull-based para AKS, com orientação opinativa sobre GitOps, integração com ACR e segurança de pipeline."
---

# CI/CD para AKS

Existem dois modelos de entrega para Kubernetes: push-based (seu pipeline envia para o cluster) e pull-based (o cluster puxa o estado desejado do Git). A maioria dos times começa com push-based porque parece familiar. Times de produção eventualmente migram para pull-based porque realmente funciona em escala.

## Dois modelos: push vs pull

| Aspecto | Push-based (pipeline CI/CD) | Pull-based (GitOps) |
|---------|---------------------------|---------------------|
| Quem aplica as mudanças | Pipeline (externo) | Controller no cluster |
| Detecção de drift | Nenhuma | Reconciliação contínua |
| Auto-recuperação | Não | Sim |
| Trilha de auditoria | Logs do pipeline | Histórico do Git |
| Exposição de credenciais | Pipeline precisa de credenciais do cluster | Controller tem acesso ao cluster nativamente |
| Melhor para | Dev/test, iteração rápida | Produção, multi-cluster |

:::tip

Use GitOps (Flux ou ArgoCD) para produção. Push-based é aceitável para dev/test mas não oferece detecção de drift ou auto-recuperação. Quando alguém executa `kubectl edit` as 2 da manhã e quebra algo, o GitOps reverte automaticamente. Pipelines push-based não fazem ideia de que isso aconteceu.
:::

## Pipeline de CI: build e push

Seu pipeline de CI deve fazer exatamente isto: build, testar, construir imagem, enviar para o ACR, atualizar manifesto. Nada mais. Não faça deploy a partir do CI.

```yaml
# .github/workflows/ci.yml
name: Build and Push to ACR

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Azure Login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Build and push to ACR
        run: |
          az acr login --name ${{ vars.ACR_NAME }}
          docker build -t ${{ vars.ACR_NAME }}.azurecr.io/myapp:${{ github.sha }} .
          docker push ${{ vars.ACR_NAME }}.azurecr.io/myapp:${{ github.sha }}

      - name: Update manifest
        run: |
          cd manifests/
          kustomize edit set image myapp=${{ vars.ACR_NAME }}.azurecr.io/myapp:${{ github.sha }}
          git add . && git commit -m "Deploy ${{ github.sha }}" && git push
```

:::warning

Nunca use tags `latest` em manifestos de produção. Cada deployment deve referenciar uma imagem com tag imutável baseada em SHA. A tag `latest` é uma mentira -- significa apenas "o que foi enviado por último" e dá zero reprodutibilidade.
:::

## Pipeline de CD: reconciliação GitOps

O lado do CD é tratado pelo Flux ou ArgoCD rodando dentro do seu cluster. Ele observa o repositório de manifestos e aplica as mudanças. A única função do seu pipeline de CI é atualizar o repositório de manifestos com a nova tag de imagem.

Essa separação importa: o CI é dono de "o artefato é bom?" e o CD é dono de "o cluster está no estado desejado?" Misturar os dois (pipeline faz `kubectl apply`) significa que seu pipeline precisa de credenciais do cluster, seu cluster não tem detecção de drift e ninguém consegue responder "o que está realmente rodando agora?" sem verificar o cluster diretamente.

:::info

O repositório de manifestos é seu registro de deploys. Cada mudança é um commit Git com autor, timestamp e diff. Quando algo quebra as 3 da manhã, `git log` mostra exatamente o que mudou e quem aprovou.
:::

## Integração com ACR

Conecte o ACR ao seu cluster AKS com managed identity. Isso dá a cada node acesso de pull sem senha e sem nenhum gerenciamento de secrets:

```bash
# Conectar ACR ao AKS (configuração única)
az aks update \
  --resource-group myResourceGroup \
  --name myAKSCluster \
  --attach-acr myACRName

# Verificar se a integração funciona
az aks check-acr \
  --resource-group myResourceGroup \
  --name myAKSCluster \
  --acr myACRName.azurecr.io
```

:::warning

Sempre use ACR com managed identity. Nunca coloque credenciais do Docker Hub no seu cluster. ImagePullSecrets com senhas de registry são um incidente de segurança esperando para acontecer -- eles são commitados em repos, compartilhados no Slack e nunca rotacionados.
:::

## Segurança: passos inegociáveis

1. **Escaneamento de imagens**: Habilite o Microsoft Defender for Containers. Ele escaneia imagens no ACR e bloqueia imagens vulneráveis na admissão.
2. **Controle de admissão**: Use Azure Policy para garantir que apenas imagens do seu ACR possam rodar no cluster.
3. **Federação OIDC**: Use federação de workload identity para GitHub Actions -- sem secrets de longa duração.
4. **Imutabilidade de tags de imagem**: Habilite o bloqueio de tags no ACR para que tags enviadas não possam ser sobrescritas.

```bash
# Habilitar Defender for Containers
az security pricing create \
  --name Containers \
  --tier Standard

# Bloquear imagens que não são do seu ACR
az policy assignment create \
  --name 'only-allowed-registries' \
  --policy 'febd0533-8e55-448f-b837-bd0e06f16469' \
  --params '{"allowedContainerImagesRegex": {"value": "^myacr\\.azurecr\\.io/.+$"}}'
```

## Arquitetura do pipeline: o que vai onde

| Responsabilidade | Onde pertence | Por que |
|------------------|--------------|---------|
| Testes unitários | Pipeline de CI | Feedback rápido sobre qualidade do código |
| Build do container | Pipeline de CI | Produzir artefato imutável |
| Escaneamento de imagem | Pipeline de CI + ACR | Bloquear vulnerabilidades antes de chegarem ao cluster |
| Atualização de manifesto | Pipeline de CI (último passo) | Disparar reconciliação GitOps |
| Deploy no cluster | Controller GitOps | Pull-based, auto-recuperável, auditável |
| Testes de smoke | Hook pós-deploy | Validar que o deploy funcionou |

## Erros comuns

- Fazer deploy diretamente do CIpara o cluster (pulando GitOps) -- funciona até você ter 3 clusters e nenhuma ideia do que está rodando onde
- Usar Docker Hub como seu registry de produção -- limites de taxa, sem rede privada, sem geo-replicação
- Armazenar kubeconfig em secrets do pipeline -- use federação OIDC em vez disso
- Não escanear imagens -- você vai enviar CVEs para produção
- Rodar testes após o deploy em vez de no CI -- código quebrado chega ao cluster antes de você saber que está quebrado
- Sem imutabilidade de tag de imagem -- alguém envia sobre uma tag existente e seu rollback aponta para código novo quebrado

## Promoção entre ambientes

Promova entre ambientes usando branches ou diretórios no seu repositório de manifestos:

![Promoção entre Ambientes](/img/env-promotion.svg)

:::info

Nunca faça deploy automático para produção. Staging pode fazer deploy automático no merge para a branch de staging. Produção deve exigir um pull request com pelo menos uma aprovação. Isso dá a você um checkpoint humano sem desacelerar o desenvolvimento.
:::

## Recursos

- [CI/CD do AKS com GitHub Actions](https://learn.microsoft.com/en-us/azure/aks/kubernetes-action)
- [Conectar ACR ao AKS](https://learn.microsoft.com/en-us/azure/aks/cluster-container-registry-integration)
- [Defender for Containers](https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-containers-introduction)
- [Azure Policy para AKS](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/policy-for-kubernetes)
