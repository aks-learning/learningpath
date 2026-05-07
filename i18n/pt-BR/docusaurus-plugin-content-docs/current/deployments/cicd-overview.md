---
sidebar_position: 1
title: "CI/CD para AKS"
description: "Modelos de entrega push-based vs pull-based para AKS, com orientacao opinativa sobre GitOps, integracao com ACR e seguranca de pipeline."
---

# CI/CD para AKS

Existem dois modelos de entrega para Kubernetes: push-based (seu pipeline envia para o cluster) e pull-based (o cluster puxa o estado desejado do Git). A maioria dos times comeca com push-based porque parece familiar. Times de producao eventualmente migram para pull-based porque realmente funciona em escala.

## Dois Modelos: Push vs Pull

| Aspecto | Push-based (pipeline CI/CD) | Pull-based (GitOps) |
|---------|---------------------------|---------------------|
| Quem aplica as mudancas | Pipeline (externo) | Controller no cluster |
| Deteccao de drift | Nenhuma | Reconciliacao continua |
| Auto-recuperacao | Nao | Sim |
| Trilha de auditoria | Logs do pipeline | Historico do Git |
| Exposicao de credenciais | Pipeline precisa de credenciais do cluster | Controller tem acesso ao cluster nativamente |
| Melhor para | Dev/test, iteracao rapida | Producao, multi-cluster |

:::tip

Use GitOps (Flux ou ArgoCD) para producao. Push-based e aceitavel para dev/test mas nao oferece deteccao de drift ou auto-recuperacao. Quando alguem executa `kubectl edit` as 2 da manha e quebra algo, o GitOps reverte automaticamente. Pipelines push-based nao fazem ideia de que isso aconteceu.
:::

## Pipeline de CI: Build e Push

Seu pipeline de CI deve fazer exatamente isto: build, testar, construir imagem, enviar para o ACR, atualizar manifesto. Nada mais. Nao faca deploy a partir do CI.

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

Nunca use tags `latest` em manifestos de producao. Cada deployment deve referenciar uma imagem com tag imutavel baseada em SHA. A tag `latest` e uma mentira -- significa apenas "o que foi enviado por ultimo" e da zero reprodutibilidade.
:::

## Pipeline de CD: Reconciliacao GitOps

O lado do CD e tratado pelo Flux ou ArgoCD rodando dentro do seu cluster. Ele observa o repositorio de manifestos e aplica as mudancas. A unica funcao do seu pipeline de CI e atualizar o repositorio de manifestos com a nova tag de imagem.

Essa separacao importa: o CI e dono de "o artefato e bom?" e o CD e dono de "o cluster esta no estado desejado?" Misturar os dois (pipeline faz `kubectl apply`) significa que seu pipeline precisa de credenciais do cluster, seu cluster nao tem deteccao de drift e ninguem consegue responder "o que esta realmente rodando agora?" sem verificar o cluster diretamente.

:::info

O repositorio de manifestos e seu registro de deploys. Cada mudanca e um commit Git com autor, timestamp e diff. Quando algo quebra as 3 da manha, `git log` mostra exatamente o que mudou e quem aprovou.
:::

## Integracao com ACR

Conecte o ACR ao seu cluster AKS com managed identity. Isso da a cada node acesso de pull sem senha e sem nenhum gerenciamento de secrets:

```bash
# Conectar ACR ao AKS (configuracao unica)
az aks update \
  --resource-group myResourceGroup \
  --name myAKSCluster \
  --attach-acr myACRName

# Verificar se a integracao funciona
az aks check-acr \
  --resource-group myResourceGroup \
  --name myAKSCluster \
  --acr myACRName.azurecr.io
```

:::warning

Sempre use ACR com managed identity. Nunca coloque credenciais do Docker Hub no seu cluster. ImagePullSecrets com senhas de registry sao um incidente de seguranca esperando para acontecer -- eles sao commitados em repos, compartilhados no Slack e nunca rotacionados.
:::

## Seguranca: Passos Inegociaveis

1. **Escaneamento de imagens**: Habilite o Microsoft Defender for Containers. Ele escaneia imagens no ACR e bloqueia imagens vulneraveis na admissao.
2. **Controle de admissao**: Use Azure Policy para garantir que apenas imagens do seu ACR possam rodar no cluster.
3. **Federacao OIDC**: Use federacao de workload identity para GitHub Actions -- sem secrets de longa duracao.
4. **Imutabilidade de tags de imagem**: Habilite o bloqueio de tags no ACR para que tags enviadas nao possam ser sobrescritas.

```bash
# Habilitar Defender for Containers
az security pricing create \
  --name Containers \
  --tier Standard

# Bloquear imagens que nao sao do seu ACR
az policy assignment create \
  --name 'only-allowed-registries' \
  --policy 'febd0533-8e55-448f-b837-bd0e06f16469' \
  --params '{"allowedContainerImagesRegex": {"value": "^myacr\\.azurecr\\.io/.+$"}}'
```

## Arquitetura do Pipeline: O que Vai Onde

| Responsabilidade | Onde pertence | Por que |
|------------------|--------------|---------|
| Testes unitarios | Pipeline de CI | Feedback rapido sobre qualidade do codigo |
| Build do container | Pipeline de CI | Produzir artefato imutavel |
| Escaneamento de imagem | Pipeline de CI + ACR | Bloquear vulnerabilidades antes de chegarem ao cluster |
| Atualizacao de manifesto | Pipeline de CI (ultimo passo) | Disparar reconciliacao GitOps |
| Deploy no cluster | Controller GitOps | Pull-based, auto-recuperavel, auditavel |
| Testes de smoke | Hook pos-deploy | Validar que o deploy funcionou |

## Erros Comuns

- Fazer deploy diretamente do CI para o cluster (pulando GitOps) -- funciona ate voce ter 3 clusters e nenhuma ideia do que esta rodando onde
- Usar Docker Hub como seu registry de producao -- limites de taxa, sem rede privada, sem geo-replicacao
- Armazenar kubeconfig em secrets do pipeline -- use federacao OIDC em vez disso
- Nao escanear imagens -- voce vai enviar CVEs para producao
- Rodar testes apos o deploy em vez de no CI -- codigo quebrado chega ao cluster antes de voce saber que esta quebrado
- Sem imutabilidade de tag de imagem -- alguem envia sobre uma tag existente e seu rollback aponta para codigo novo quebrado

## Promocao entre Ambientes

Promova entre ambientes usando branches ou diretorios no seu repositorio de manifestos:

![Promocao entre Ambientes](/img/env-promotion.svg)

:::info

Nunca faca deploy automatico para producao. Staging pode fazer deploy automatico no merge para a branch de staging. Producao deve exigir um pull request com pelo menos uma aprovacao. Isso da a voce um checkpoint humano sem desacelerar o desenvolvimento.
:::

## Recursos

- [CI/CD do AKS com GitHub Actions](https://learn.microsoft.com/en-us/azure/aks/kubernetes-action)
- [Conectar ACR ao AKS](https://learn.microsoft.com/en-us/azure/aks/cluster-container-registry-integration)
- [Defender for Containers](https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-containers-introduction)
- [Azure Policy para AKS](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/policy-for-kubernetes)
