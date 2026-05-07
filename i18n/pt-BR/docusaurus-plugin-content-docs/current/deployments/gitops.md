---
sidebar_position: 3
title: "GitOps com Flux"
description: "GitOps para AKS usando Flux v2 como extensao suportada pela Microsoft, com comparacao ao ArgoCD e exemplos de configuracao do mundo real."
---

# GitOps com Flux

GitOps significa uma coisa: o estado desejado do seu cluster vive no Git, e um controller dentro do cluster reconcilia continuamente o estado real para corresponder. Nenhum humano executa `kubectl apply` em producao. Nenhum pipeline tem credenciais do cluster. O Git e a unica fonte de verdade, e o cluster puxa dele.

:::warning

Nunca execute `kubectl apply` de um laptop em producao. Todas as mudancas de producao passam pelo Git. Se nao esta no repositorio, nao existe. Se alguem editar um recurso diretamente, o controller GitOps reverte em minutos.
:::

## Flux vs ArgoCD: Escolha Um

| Aspecto | Flux v2 | ArgoCD |
|---------|---------|--------|
| Integracao com AKS | Extensao nativa, suportada pela Microsoft | Instalacao da comunidade, autogerenciado |
| UI | Minima (add-on Weave GitOps) | Dashboard integrado rico |
| Multi-tenancy | Forte, nativo | Requer configuracao de AppProject |
| Curva de aprendizado | Menor para times Azure | Menor para times com experiencia em ArgoCD |
| Footprint de CRDs | Mais leve | Mais pesado |
| Adocao | Crescente no ecossistema Azure | Dominante na comunidade K8s mais ampla |

:::tip

Use Flux se voce quer GitOps suportado pela Microsoft com AKS. Voce tem tickets de suporte Azure, integracao com Azure Policy e um ciclo de vida limpo de extensao AKS. Use ArgoCD se seu time ja conhece ou se voce precisa da UI para visibilidade entre muitas aplicacoes.
:::

## Como o Flux Funciona

O Flux opera atraves de um loop de reconciliacao com dois recursos principais:

1. **GitRepository**: Aponta para seu repositorio Git, faz polling por mudancas
2. **Kustomization**: Define qual caminho no repositorio aplicar e como

![Loop de Reconciliacao do Flux](/img/flux-reconciliation.svg)

Quando alguem envia um commit que altera um manifesto, o Flux detecta dentro do intervalo de polling (padrao: 1 minuto), puxa o novo estado e aplica. Se a aplicacao falhar, ele reporta o erro e tenta novamente.

## Instalando o Flux no AKS

O Flux e instalado como uma extensao do AKS. Um comando:

```bash
az k8s-extension create \
  --resource-group myResourceGroup \
  --cluster-name myAKSCluster \
  --cluster-type managedClusters \
  --extension-type microsoft.flux \
  --name flux
```

Isso instala os controllers do Flux (source-controller, kustomize-controller, helm-controller, notification-controller) no namespace `flux-system`.

## Configurando uma Fonte GitOps

Apos o Flux ser instalado, crie um `GitRepository` e uma `Kustomization` para apontar para seus manifestos:

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: app-manifests
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/myorg/k8s-manifests
  ref:
    branch: main
  secretRef:
    name: git-credentials  # For private repos
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: apps
  namespace: flux-system
spec:
  interval: 5m
  sourceRef:
    kind: GitRepository
    name: app-manifests
  path: ./clusters/production
  prune: true              # Delete resources removed from Git
  validation: client
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: myapp
      namespace: default
```

:::info

Sempre configure `prune: true`. Sem isso, o Flux vai criar e atualizar recursos mas nunca deleta-los. Voce acaba com recursos orfaos que divergem do seu estado no Git -- anulando todo o proposito do GitOps.
:::

## Estrutura do Repositorio

Organize seu repositorio de manifestos para multi-ambiente e multi-cluster:

```
k8s-manifests/
  clusters/
    production/
      kustomization.yaml    # References base + production overlays
    staging/
      kustomization.yaml
  base/
    deployment.yaml
    service.yaml
    kustomization.yaml
  overlays/
    production/
      replica-count.yaml
      resource-limits.yaml
    staging/
      replica-count.yaml
```

## Multi-Cluster e Gerenciamento de Frota

O Flux suporta multi-tenancy nativamente. Para configuracao em nivel de frota entre multiplos clusters AKS, use Azure Arc com Flux:

```bash
# Apply same GitOps config to all clusters in a resource group
az k8s-configuration flux create \
  --resource-group fleet-rg \
  --cluster-name cluster-eastus \
  --cluster-type managedClusters \
  --name platform-config \
  --namespace flux-system \
  --url https://github.com/myorg/platform-config \
  --branch main \
  --kustomization name=infra path=./infrastructure prune=true \
  --kustomization name=apps path=./apps/production prune=true dependsOn=infra
```

## Erros Comuns

- Nao configurar `prune: true`: Recursos se acumulam no cluster sem referencia no Git
- Intervalo de polling muito longo: Configure `interval: 1m` para a fonte, nao 10m -- voce quer feedback rapido
- Sem health checks na Kustomization: O Flux marca uma reconciliacao como bem-sucedida mesmo se o Deployment esta em crashloop
- Armazenar secrets no Git: Use Sealed Secrets ou External Secrets Operator -- nunca Secrets do Kubernetes em texto puro em um repositorio
- Pular a branch de staging: Aplique no staging primeiro, promova para producao via PR

:::warning

O Flux vai aplicar manifestos quebrados sem problema. Adicione health checks na sua Kustomization para que o Flux reporte falhas quando Deployments nao ficarem saudaveis. Sem isso, voce so descobre que algo esta errado quando os usuarios reclamam.
:::

## Recursos

- [Flux v2 no AKS (documentacao Microsoft)](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/tutorial-use-gitops-flux2)
- [Documentacao do Flux v2](https://fluxcd.io/flux/)
- [Documentacao do ArgoCD](https://argo-cd.readthedocs.io/)
- [Blueprint GitOps para AKS](https://learn.microsoft.com/en-us/azure/architecture/example-scenario/gitops-aks/gitops-blueprint-aks)
- [Sealed Secrets](https://sealed-secrets.netlify.app/)
