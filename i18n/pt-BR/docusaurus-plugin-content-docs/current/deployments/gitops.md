---
sidebar_position: 3
title: "GitOps com Flux"
description: "GitOps para AKS usando Flux v2 como extensão suportada pela Microsoft, com comparação ao ArgoCD e exemplos de configuração do mundo real."
---

# GitOps com Flux

GitOps significa uma coisa: o estado desejado do seu cluster vive no Git, e um controller dentro do cluster reconcilia continuamente o estado real para corresponder. Nenhum humano executa `kubectl apply` em produção. Nenhum pipeline tem credenciais do cluster. O Git é a única fonte de verdade, e o cluster puxa dele.

:::warning

Nunca execute `kubectl apply` de um laptop em produção. Todas as mudanças de produção passam pelo Git. Se não está no repositório, não existe. Se alguém editar um recurso diretamente, o controller GitOps reverte em minutos.
:::

## Flux vs ArgoCD: escolha um

| Aspecto | Flux v2 | ArgoCD |
|---------|---------|--------|
| Integração com AKS | Extensão nativa, suportada pela Microsoft | Instalação da comunidade, autogerenciado |
| UI | Mínima (add-on Weave GitOps) | Dashboard integrado rico |
| Multi-tenancy | Forte, nativo | Requer configuração de AppProject |
| Curva de aprendizado | Menor para times Azure | Menor para times com experiência em ArgoCD |
| Footprint de CRDs | Mais leve | Mais pesado |
| Adoção | Crescente no ecossistema Azure | Dominante na comunidade K8s mais ampla |

:::tip

Use Flux se você quer GitOps suportado pela Microsoft com AKS. Você tem tickets de suporte Azure, integração com Azure Policy e um ciclo de vida limpo de extensão AKS. Use ArgoCD se seu time já conhece ou se você precisa da UI para visibilidade entre muitas aplicações.
:::

## Como o Flux funciona

O Flux opera através de um loop de reconciliação com dois recursos principais:

1. **GitRepository**: Aponta para seu repositório Git, faz polling por mudanças
2. **Kustomization**: Define qual caminho no repositório aplicar e como

![Loop de Reconciliação do Flux](/img/flux-reconciliation.svg)

Quando alguém envia um commit que altera um manifesto, o Flux detecta dentro do intervalo de polling (padrão: 1 minuto), puxa o novo estado e aplica. Se a aplicação falhar, ele reporta o erro e tenta novamente.

## Instalando o Flux no AKS

O Flux é instalado como uma extensão do AKS. Um comando:

```bash
az k8s-extension create \
  --resource-group myResourceGroup \
  --cluster-name myAKSCluster \
  --cluster-type managedClusters \
  --extension-type microsoft.flux \
  --name flux
```

Isso instala os controllers do Flux (source-controller, kustomize-controller, helm-controller, notification-controller) no namespace `flux-system`.

## Configurando uma fonte GitOps

Após o Flux ser instalado, crie um `GitRepository` e uma `Kustomization` para apontar para seus manifestos:

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

Sempre configure `prune: true`. Sem isso, o Flux vai criar e atualizar recursos mas nunca deletá-los. Você acaba com recursos órfãos que divergem do seu estado no Git -- anulando todo o propósito do GitOps.
:::

## Estrutura do repositório

Organize seu repositório de manifestos para multi-ambiente e multi-cluster:

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

## Multi-cluster e gerenciamento de frota

O Flux suporta multi-tenancy nativamente. Para configuração em nível de frota entre múltiplos clusters AKS, use Azure Arc com Flux:

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

## Erros comuns

- Não configurar `prune: true`: Recursos se acumulam no cluster sem referência no Git
- Intervalo de polling muito longo: Configure `interval: 1m` para a fonte, não 10m -- você quer feedback rápido
- Sem health checks na Kustomization: O Flux marca uma reconciliação como bem-sucedida mesmo se o Deployment está em crashloop
- Armazenar secrets no Git: Use Sealed Secrets ou External Secrets Operator -- nunca Secrets do Kubernetes em texto puro em um repositório
- Pular a branch de staging: Aplique no staging primeiro, promova para produção via PR

:::warning

O Flux vai aplicar manifestos quebrados sem problema. Adicione health checks na sua Kustomization para que o Flux reporte falhas quando Deployments não ficarem saudáveis. Sem isso, você só descobre que algo está errado quando os usuários reclamam.
:::

## Recursos

- [Flux v2 no AKS (documentação Microsoft)](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/tutorial-use-gitops-flux2)
- [Documentação do Flux v2](https://fluxcd.io/flux/)
- [Documentação do ArgoCD](https://argo-cd.readthedocs.io/)
- [Blueprint GitOps para AKS](https://learn.microsoft.com/en-us/azure/architecture/example-scenario/gitops-aks/gitops-blueprint-aks)
- [Sealed Secrets](https://sealed-secrets.netlify.app/)
