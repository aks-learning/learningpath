---
sidebar_position: 3
title: "GitOps with Flux"
description: "GitOps for AKS using Flux v2 as a Microsoft-supported extension, with comparison to ArgoCD and real-world configuration examples."
---

# GitOps with Flux

GitOps means one thing: the desired state of your cluster lives in Git, and a controller inside the cluster continuously reconciles actual state to match. No human runs `kubectl apply` in production. No pipeline has cluster credentials. Git is the single source of truth, and the cluster pulls from it.

:::warning

Never `kubectl apply` from a laptop in production. All production changes go through Git. If it is not in the repo, it does not exist. If someone edits a resource directly, the GitOps controller reverts it within minutes.
:::

## Flux vs ArgoCD: Pick One

| Aspect | Flux v2 | ArgoCD |
|--------|---------|--------|
| AKS integration | Native extension, Microsoft-supported | Community install, self-managed |
| UI | Minimal (Weave GitOps add-on) | Rich built-in dashboard |
| Multi-tenancy | Strong, native | Requires AppProject configuration |
| Learning curve | Lower for Azure teams | Lower for teams with ArgoCD experience |
| CRD footprint | Lighter | Heavier |
| Adoption | Growing in Azure ecosystem | Dominant in broader K8s community |

:::tip

Use Flux if you want Microsoft-supported GitOps with AKS. You get Azure support tickets, integration with Azure Policy, and a clean AKS extension lifecycle. Use ArgoCD if your team already knows it or you need the UI for visibility across many applications.
:::

## How Flux Works

Flux operates through a reconciliation loop with two core resources:

1. **GitRepository**: Points to your Git repo, polls for changes
2. **Kustomization**: Defines what path in the repo to apply and how

![Flux Reconciliation Loop](/img/flux-reconciliation.svg)

When someone pushes a commit that changes a manifest, Flux detects it within the poll interval (default: 1 minute), pulls the new state, and applies it. If the apply fails, it reports the error and retries.

## Installing Flux on AKS

Flux is installed as an AKS extension. One command:

```bash
az k8s-extension create \
  --resource-group myResourceGroup \
  --cluster-name myAKSCluster \
  --cluster-type managedClusters \
  --extension-type microsoft.flux \
  --name flux
```

This installs the Flux controllers (source-controller, kustomize-controller, helm-controller, notification-controller) into the `flux-system` namespace.

## Configuring a GitOps Source

After Flux is installed, create a `GitRepository` and `Kustomization` to point at your manifests:

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

Always set `prune: true`. Without it, Flux will create and update resources but never delete them. You end up with orphaned resources that drift from your Git state -- defeating the entire purpose of GitOps.
:::

## Repository Structure

Organize your manifest repo for multi-environment and multi-cluster:

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

## Multi-Cluster and Fleet Management

Flux supports multi-tenancy natively. For fleet-level configuration across multiple AKS clusters, use Azure Arc with Flux:

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

## Common Mistakes

- Not setting `prune: true`: Resources pile up in the cluster with no Git reference
- Polling interval too long: Set `interval: 1m` for source, not 10m -- you want fast feedback
- No health checks in Kustomization: Flux marks a reconciliation as successful even if the Deployment is crashlooping
- Storing secrets in Git: Use Sealed Secrets or External Secrets Operator -- never plain Kubernetes Secrets in a repo
- Skipping the staging branch: Apply to staging first, promote to production via PR

:::warning

Flux will happily apply broken manifests. Add health checks to your Kustomization so that Flux reports failures when Deployments do not become healthy. Without this, you only find out something is wrong when users complain.
:::

## Resources

- [Flux v2 on AKS (Microsoft docs)](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/tutorial-use-gitops-flux2)
- [Flux v2 Documentation](https://fluxcd.io/flux/)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [GitOps Blueprint for AKS](https://learn.microsoft.com/en-us/azure/architecture/example-scenario/gitops-aks/gitops-blueprint-aks)
- [Sealed Secrets](https://sealed-secrets.netlify.app/)
