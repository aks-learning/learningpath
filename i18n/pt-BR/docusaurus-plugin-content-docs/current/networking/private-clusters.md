---
sidebar_position: 4
title: "Clusters Privados"
description: "Todo cluster de producao deveria ser privado ou, no minimo, ter faixas de IP autorizadas. Um API server publico em producao e negligencia."
---

# Clusters Privados

Todo cluster AKS de producao deveria ser privado ou, no minimo, ter faixas de IP autorizadas configuradas. Rodar um Kubernetes API server publico em producao e negligencia -- voce esta expondo seu control plane para a internet inteira e confiando apenas em RBAC para manter atacantes de fora.

## Modelos de Acesso ao API Server

| Modo | Endpoint do API Server | Quem Pode Acessar | Caso de Uso |
|------|----------------------|-------------------|-------------|
| **Publico (padrao)** | IP publico, sem restricoes | Qualquer pessoa na internet | Apenas dev/test |
| **Faixas de IP autorizadas** | IP publico, allowlist de IPs | Apenas CIDRs especificados | Producao minimamente viavel |
| **Cluster privado** | Private endpoint na VNet | Apenas clientes conectados a VNet | Padrao de producao |
| **Privado + faixas autorizadas** | Private endpoint + publico com allowlist | Acesso hibrido | Estado de transicao |

:::warning

API server publico em producao e negligencia. Um atacante com um kubeconfig ou token de service account vazado tem acesso de rede direto ao seu control plane. Defesa em profundidade exige restricoes no nivel de rede.
:::

## Arquitetura de Cluster Privado

Um cluster AKS privado coloca o API server atras de um Private Endpoint na sua VNet. O API server recebe um endereco IP privado, e a resolucao de DNS e tratada via zona de Azure Private DNS (`privatelink.<region>.azmk8s.io`).

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

Componentes principais:
- **Private Endpoint**: API server acessivel apenas via IP privado na sua VNet
- **Zona de Private DNS**: Resolve `*.privatelink.<region>.azmk8s.io` para o IP privado
- **Sem FQDN publico**: Por padrao, a entrada DNS publica e desabilitada (configuravel)

```bash
# Disable public FQDN entirely (recommended for strict environments)
az aks update \
  --name prod-cluster \
  --resource-group prod-rg \
  --disable-public-fqdn
```

## Se Voce Nao Pode Ir Totalmente Privado: Faixas de IP Autorizadas

Para times que nao estao prontos para clusters totalmente privados (complexidade de CI/CD, ferramentas de acesso para desenvolvedores), faixas de IP autorizadas sao o minimo:

```bash
# Restrict API server to specific IPs
az aks update \
  --name prod-cluster \
  --resource-group prod-rg \
  --api-server-authorized-ip-ranges "203.0.113.0/24,198.51.100.10/32"
```

:::info

Faixas de IP autorizadas e clusters privados nao sao mutuamente exclusivos. Voce pode habilitar ambos -- o private endpoint para acesso via VNet e faixas autorizadas para IPs publicos especificos (ex.: saida do escritorio corporativo).
:::

## Acessando um Cluster Privado

A reclamacao numero um sobre clusters privados: "Como eu rodo kubectl?" Aqui estao suas opcoes, ordenadas por praticidade:

### Opcao 1: `az aks command invoke` (Mais Simples)

Execute comandos sem nenhum caminho de rede para o API server. O Azure faz proxy do comando pela infraestrutura gerenciada.

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

Bom para: Acesso de emergencia, verificacoes rapidas, pipelines de CI/CD sem VPN.
Ruim para: Debugging interativo, uso intenso de kubectl, operacoes Helm com multiplos arquivos.

### Opcao 2: Azure Bastion + Jump Box

Implante uma VM na mesma VNet (ou VNet pareada) e acesse via Azure Bastion:

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

### Opcao 3: VPN / ExpressRoute

Conecte sua rede corporativa a Azure VNet via VPN S2S ou ExpressRoute. Desenvolvedores rodam kubectl de suas estacoes de trabalho como se o API server fosse local.

### Opcao 4: GitHub Actions com Self-Hosted Runners

Para CI/CD, implante self-hosted runners dentro da VNet:

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

## Padroes de Pipeline CI/CD para Clusters Privados

| Abordagem | Complexidade | Melhor Para |
|-----------|-------------|-------------|
| `az aks command invoke` | Baixa | Deployments simples, times pequenos |
| Self-hosted runners na VNet | Media | GitHub Actions, Azure DevOps |
| Agentes Azure DevOps em VMSS | Media | Pipelines Azure DevOps |
| Flux/ArgoCD (GitOps) | Media | Deployment pull-based (sem acesso ao API necessario a partir do CI) |
| Azure Deployment Environments | Baixa | Times de platform engineering |

:::tip

GitOps (Flux ou ArgoCD) e o padrao mais limpo para clusters privados. O agente GitOps roda dentro do cluster e puxa mudancas -- nenhum caminho de rede de entrada para o API server e necessario a partir do seu sistema de CI.
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

## Opcoes de Zona de Private DNS

| Opcao | Comportamento | Caso de Uso |
|-------|--------------|-------------|
| `system` | AKS cria e gerencia a zona | Cluster unico, configuracao simples |
| `none` | Sem private DNS, voce gerencia a resolucao | BYO DNS, resolucao customizada |
| Resource ID | Usar zona de Private DNS existente | Hub-spoke, infraestrutura de DNS compartilhada |

Para topologias hub-spoke, use uma zona de Private DNS compartilhada no hub:

```bash
az aks create \
  --name prod-cluster \
  --resource-group prod-rg \
  --enable-private-cluster \
  --private-dns-zone /subscriptions/.../privateDnsZones/privatelink.eastus.azmk8s.io
```

## Erros Comuns

1. **Nao planejar resolucao de DNS** -- Clusters privados exigem vinculacao de zona de Private DNS a toda VNet que precisa de acesso. Esqueca uma VNet e o kubectl da timeout.
2. **Bloquear `command invoke`** -- Alguns times desabilitam via Azure Policy sem fornecer um caminho de acesso alternativo. Nao se tranque para fora.
3. **Esquecer acesso ao ACR** -- Clusters privados ainda precisam puxar imagens. Use Private Endpoint para o ACR ou vincule o ACR via managed identity.
4. **Pipelines de CI/CD sem caminho de rede** -- Seu runner do GitHub Actions nao consegue acessar um API server privado. Planeje isso antes de ir para o privado.
5. **Misturar publico e privado na mesma VNet** -- Se um cluster e privado, as expectativas de acesso entre peers ficam confusas. Seja consistente.

## Recursos

- [Private AKS Clusters](https://learn.microsoft.com/en-us/azure/aks/private-clusters)
- [API Server Authorized IP Ranges](https://learn.microsoft.com/en-us/azure/aks/api-server-authorized-ip-ranges)
- [AKS Command Invoke](https://learn.microsoft.com/en-us/azure/aks/access-private-cluster)
- [Flux GitOps on AKS](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/conceptual-gitops-flux2)
- [AKS Labs](https://azure-samples.github.io/aks-labs)

---

**Proximo**: [Service Mesh](./service-mesh) -- voce realmente precisa de um?
