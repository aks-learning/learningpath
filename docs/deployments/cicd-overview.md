---
sidebar_position: 1
title: "CI/CD for AKS"
description: "Push-based vs pull-based delivery models for AKS, with opinionated guidance on GitOps, ACR integration, and pipeline security."
---

# CI/CD for AKS

There are two delivery models for Kubernetes: push-based (your pipeline pushes to the cluster) and pull-based (the cluster pulls desired state from Git). Most teams start with push-based because it feels familiar. Production teams eventually move to pull-based because it actually works at scale.

## Two Models: Push vs Pull

| Aspect | Push-based (CI/CD pipeline) | Pull-based (GitOps) |
|--------|---------------------------|---------------------|
| Who applies changes | Pipeline (external) | Controller in cluster |
| Drift detection | None | Continuous reconciliation |
| Self-healing | No | Yes |
| Audit trail | Pipeline logs | Git history |
| Credential exposure | Pipeline needs cluster creds | Controller has cluster access natively |
| Best for | Dev/test, quick iteration | Production, multi-cluster |

:::tip
Use GitOps (Flux or ArgoCD) for production. Push-based is fine for dev/test but does not give you drift detection or self-healing. When someone runs `kubectl edit` at 2 AM and breaks something, GitOps reverts it automatically. Push-based pipelines have no idea it happened.
:::

## CI Pipeline: Build and Push

Your CI pipeline should do exactly this: build, test, build image, push to ACR, update manifest. Nothing else. Do not deploy from CI.

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
Never use `latest` tags in production manifests. Every deployment should reference an immutable SHA-tagged image. The `latest` tag is a lie -- it just means "whatever was pushed last" and gives you zero reproducibility.
:::

## CD Pipeline: GitOps Reconciliation

The CD side is handled by Flux or ArgoCD running inside your cluster. It watches the manifest repository and applies changes. Your CI pipeline's only job is to update the manifest repo with the new image tag.

This separation matters: CI owns "is the artifact good?" and CD owns "is the cluster in desired state?" Mixing them (pipeline does `kubectl apply`) means your pipeline needs cluster credentials, your cluster has no drift detection, and nobody can answer "what is actually running right now?" without checking the cluster directly.

:::info
The manifest repo is your deployment record. Every change is a Git commit with author, timestamp, and diff. When something breaks at 3 AM, `git log` tells you exactly what changed and who approved it.
:::

## ACR Integration

Attach ACR to your AKS cluster with managed identity. This gives every node passwordless pull access without any secrets management:

```bash
# Attach ACR to AKS (one-time setup)
az aks update \
  --resource-group myResourceGroup \
  --name myAKSCluster \
  --attach-acr myACRName

# Verify the integration works
az aks check-acr \
  --resource-group myResourceGroup \
  --name myAKSCluster \
  --acr myACRName.azurecr.io
```

:::warning
Always use ACR with managed identity attachment. Never put Docker Hub credentials in your cluster. ImagePullSecrets with registry passwords are a security incident waiting to happen -- they get committed to repos, shared in Slack, and never rotated.
:::

## Security: Non-Negotiable Steps

1. **Image scanning**: Enable Microsoft Defender for Containers. It scans images in ACR and blocks vulnerable images at admission.
2. **Admission control**: Use Azure Policy to enforce that only images from your ACR can run in the cluster.
3. **OIDC federation**: Use workload identity federation for GitHub Actions -- no long-lived secrets.
4. **Image tag immutability**: Enable tag locking in ACR so pushed tags cannot be overwritten.

```bash
# Enable Defender for Containers
az security pricing create \
  --name Containers \
  --tier Standard

# Block images not from your ACR
az policy assignment create \
  --name 'only-allowed-registries' \
  --policy 'febd0533-8e55-448f-b837-bd0e06f16469' \
  --params '{"allowedContainerImagesRegex": {"value": "^myacr\\.azurecr\\.io/.+$"}}'
```

## Pipeline Architecture: What Goes Where

| Concern | Where it belongs | Why |
|---------|-----------------|-----|
| Unit tests | CI pipeline | Fast feedback on code quality |
| Container build | CI pipeline | Produce immutable artifact |
| Image scan | CI pipeline + ACR | Block vulns before they reach cluster |
| Manifest update | CI pipeline (last step) | Trigger GitOps reconciliation |
| Cluster deployment | GitOps controller | Pull-based, self-healing, auditable |
| Smoke tests | Post-deploy hook | Validate the deployment worked |

## Common Mistakes

- Deploying directly from CI to cluster (skipping GitOps) -- works until you have 3 clusters and no idea what's running where
- Using Docker Hub as your production registry -- rate limits, no private networking, no geo-replication
- Storing kubeconfig in pipeline secrets -- use OIDC federation instead
- Not scanning images -- you will ship CVEs to production
- Running tests after deployment instead of in CI -- broken code reaches the cluster before you know it is broken
- No image tag immutability -- someone pushes over an existing tag and your rollback points to new broken code

## Environment Promotion

Promote through environments using branches or directories in your manifest repo:

```
dev  -->  staging  -->  production
(auto)    (auto)       (PR approval required)
```

:::info
Never auto-deploy to production. Staging can auto-deploy on merge to the staging branch. Production should require a pull request with at least one approval. This gives you a human checkpoint without slowing down development.
:::

## Resources

- [AKS CI/CD with GitHub Actions](https://learn.microsoft.com/en-us/azure/aks/kubernetes-action)
- [Attach ACR to AKS](https://learn.microsoft.com/en-us/azure/aks/cluster-container-registry-integration)
- [Defender for Containers](https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-containers-introduction)
- [Azure Policy for AKS](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/policy-for-kubernetes)
