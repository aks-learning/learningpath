---
sidebar_position: 4
title: "Private Clusters"
description: "Every production cluster should be private or at minimum have authorized IP ranges. A public API server in production is negligent."
---

# Private clusters

Every production AKS cluster should be private or at minimum have authorized IP ranges configured. Running a public Kubernetes API server in production is negligent -- you are exposing your control plane to the entire internet and relying solely on RBAC to keep attackers out.

## API server access models

| Mode | API Server Endpoint | Who Can Reach It | Use Case |
|------|-------------------|------------------|----------|
| **Public (default)** | Public IP, no restrictions | Anyone on the internet | Dev/test only |
| **Authorized IP ranges** | Public IP, IP allowlist | Only specified CIDRs | Minimum viable production |
| **Private cluster** | Private endpoint in VNet | Only VNet-connected clients | Production standard |
| **Private + authorized ranges** | Private endpoint + public with allowlist | Hybrid access | Transition state |

:::warning

Public API server in production is negligent. An attacker with a leaked kubeconfig or service account token has direct network access to your control plane. Defense in depth requires network-level restrictions.
:::

## Private cluster architecture

A private AKS cluster places the API server behind a Private Endpoint in your VNet. The API server gets a private IP address, and DNS resolution is handled via Azure Private DNS zone (`privatelink.<region>.azmk8s.io`).

```bash
# Create a private cluster
az aks create \
  --name prod-cluster \
  --resource-group prod-rg \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --enable-private-cluster \
  --private-dns-zone system \
  --pod-cidr 192.168.0.0/16 \
  --service-cidr 10.0.0.0/16 \
  --dns-service-ip 10.0.0.10 \
  --node-count 3
```

Key components:
- **Private Endpoint**: API server accessible only via private IP in your VNet
- **Private DNS Zone**: Resolves `*.privatelink.<region>.azmk8s.io` to the private IP
- **No public FQDN**: By default, the public DNS entry is disabled (configurable)

```bash
# Disable public FQDN entirely (recommended for strict environments)
az aks update \
  --name prod-cluster \
  --resource-group prod-rg \
  --disable-public-fqdn
```

## If you cannot go fully private: authorized IP ranges

For teams not ready for full private clusters (CI/CD complexity, developer access tooling), authorized IP ranges are the minimum:

```bash
# Restrict API server to specific IPs
az aks update \
  --name prod-cluster \
  --resource-group prod-rg \
  --api-server-authorized-ip-ranges "203.0.113.0/24,198.51.100.10/32"
```

:::info

Authorized IP ranges and private clusters are not mutually exclusive. You can enable both -- the private endpoint for VNet access and authorized ranges for specific public IPs (e.g., corporate office egress).
:::

## Accessing a private cluster

The number one complaint about private clusters: "How do I run kubectl?" Here are your options, ranked by practicality:

### Option 1: `az aks command invoke` (simplest)

Run commands without any network path to the API server. Azure proxies the command through the managed infrastructure.

```bash
# Run kubectl from anywhere, no VPN needed
az aks command invoke \
  --resource-group prod-rg \
  --name prod-cluster \
  --command "kubectl get nodes"

# Apply a manifest
az aks command invoke \
  --resource-group prod-rg \
  --name prod-cluster \
  --command "kubectl apply -f deployment.yaml" \
  --file deployment.yaml
```

Good for: Emergency access, quick checks, CI/CD pipelines without VPN.
Bad for: Interactive debugging, heavy kubectl usage, Helm operations with multiple files.

### Option 2: Azure Bastion + jump box

Deploy a VM in the same VNet (or peered VNet) and access it via Azure Bastion:

```bash
# Jump box in the same VNet as AKS
az vm create \
  --resource-group prod-rg \
  --name jumpbox \
  --image Ubuntu2204 \
  --vnet-name aks-vnet \
  --subnet jumpbox-subnet \
  --size Standard_B2s \
  --admin-username azureuser \
  --generate-ssh-keys
```

### Option 3: VPN / ExpressRoute

Connect your corporate network to the Azure VNet via S2S VPN or ExpressRoute. Developers run kubectl from their workstations as if the API server were local.

### Option 4: GitHub Actions with self-hosted runners

For CI/CD, deploy self-hosted runners inside the VNet:

```yaml
# GitHub Actions workflow for private cluster
jobs:
  deploy:
    runs-on: self-hosted  # Runner in AKS VNet
    steps:
      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - uses: azure/aks-set-context@v4
        with:
          resource-group: prod-rg
          cluster-name: prod-cluster
      - run: kubectl apply -f manifests/
```

## CI/CD pipeline patterns for private clusters

| Approach | Complexity | Best For |
|----------|------------|----------|
| `az aks command invoke` | Low | Simple deployments, small teams |
| Self-hosted runners in VNet | Medium | GitHub Actions, Azure DevOps |
| Azure DevOps agents on VMSS | Medium | Azure DevOps pipelines |
| Flux/ArgoCD (GitOps) | Medium | Pull-based deployment (no API access needed from CI) |
| Azure Deployment Environments | Low | Platform engineering teams |

:::tip

GitOps (Flux or ArgoCD) is the cleanest pattern for private clusters. The GitOps agent runs inside the cluster and pulls changes -- no inbound network path to the API server is needed from your CI system.
:::

```bash
# Enable Flux extension -- GitOps with no external API access needed
az k8s-extension create \
  --resource-group prod-rg \
  --cluster-name prod-cluster \
  --cluster-type managedClusters \
  --extension-type microsoft.flux \
  --name flux
```

## Private DNS zone options

| Option | Behavior | Use Case |
|--------|----------|----------|
| `system` | AKS creates and manages the zone | Single cluster, simple setup |
| `none` | No private DNS, you manage resolution | BYO DNS, custom resolution |
| Resource ID | Use existing Private DNS zone | Hub-spoke, shared DNS infrastructure |

For hub-spoke topologies, use a shared Private DNS zone in the hub:

```bash
az aks create \
  --name prod-cluster \
  --resource-group prod-rg \
  --enable-private-cluster \
  --private-dns-zone /subscriptions/.../privateDnsZones/privatelink.eastus.azmk8s.io
```

## Common mistakes

1. **Not planning DNS resolution** -- Private clusters require Private DNS zone linking to every VNet that needs access. Forget one VNet and kubectl times out.
2. **Blocking `command invoke`** -- Some teams disable it via Azure Policy without providing an alternative access path. Do not lock yourself out.
3. **Forgetting ACR access** -- Private clusters still need to pull images. Use Private Endpoint for ACR or attach ACR via managed identity.
4. **CI/CD pipelines with no network path** -- Your GitHub Actions runner cannot reach a private API server. Plan this before going private.
5. **Mixing public and private in the same VNet** -- If one cluster is private, peer access expectations get confusing. Be consistent.

## Resources

- [Private AKS Clusters](https://learn.microsoft.com/en-us/azure/aks/private-clusters)
- [API Server Authorized IP Ranges](https://learn.microsoft.com/en-us/azure/aks/api-server-authorized-ip-ranges)
- [AKS Command Invoke](https://learn.microsoft.com/en-us/azure/aks/access-private-cluster)
- [Flux GitOps on AKS](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/conceptual-gitops-flux2)
- [AKS Labs](https://azure-samples.github.io/aks-labs)

---

**Next**: [Service Mesh](./service-mesh) -- do you actually need one?
