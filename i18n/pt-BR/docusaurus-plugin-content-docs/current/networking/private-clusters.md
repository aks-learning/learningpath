---
sidebar_position: 4
title: "Clusters Privados"
description: "Todo cluster de produção deveria ser privado ou, no mínimo, ter faixas de IP autorizadas. Um API server público em produção é negligência."
---

# Clusters privados

Todo cluster AKS de produção deveria ser privado ou, no mínimo, ter faixas de IP autorizadas configuradas. Rodar um Kubernetes API server público em produção é negligência -- você está expondo seu control plane para a internet inteira e confiando apenas em RBAC para manter atacantes de fora.

## Modelos de acesso ao API server

| Modo | Endpoint do API Server | Quem Pode Acessar | Caso de Uso |
|------|----------------------|-------------------|-------------|
| **Público (padrão)** | IP público, sem restrições | Qualquer pessoa na internet | Apenas dev/test |
| **Faixas de IP autorizadas** | IP público, allowlist de IPs | Apenas CIDRs especificados | Produção minimamente viavel |
| **Cluster privado** | Private endpoint na VNet | Apenas clientes conectados a VNet | Padrão de produção |
| **Privado + faixas autorizadas** | Private endpoint + público com allowlist | Acesso híbrido | Estado de transição |

:::warning

API server público em produção é negligência. Um atacante com um kubeconfig ou token de service account vazado tem acesso de rede direto ao seu control plane. Defesa em profundidade exige restrições no nível de rede.
:::

## Arquitetura de cluster privado

Um cluster AKS privado coloca o API server atras de um Private Endpoint na sua VNet. O API server recebe um endereço IP privado, e a resolução de DNS é tratada via zona de Azure Private DNS (`privatelink.<region>.azmk8s.io`).

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
- **Private Endpoint**: API server acessível apenas via IP privado na sua VNet
- **Zona de Private DNS**: Resolve `*.privatelink.<region>.azmk8s.io` para o IP privado
- **Sem FQDN público**: Por padrão, a entrada DNS pública é desabilitada (configurável)

```bash
# Disable public FQDN entirely (recommended for strict environments)
az aks update \
  --name prod-cluster \
  --resource-group prod-rg \
  --disable-public-fqdn
```

## Se você não pode ir totalmente privado: faixas de IP autorizadas

Para times que não estão prontos para clusters totalmente privados (complexidade de CI/CD, ferramentas de acesso para desenvolvedores), faixas de IP autorizadas são o mínimo:

```bash
# Restrict API server to specific IPs
az aks update \
  --name prod-cluster \
  --resource-group prod-rg \
  --api-server-authorized-ip-ranges "203.0.113.0/24,198.51.100.10/32"
```

:::info

Faixas de IP autorizadas e clusters privados não são mutuamente exclusivos. Você pode habilitar ambos -- o private endpoint para acesso via VNet e faixas autorizadas para IPs públicos específicos (ex.: saída do escritório corporativo).
:::

## Acessando um cluster privado

A reclamação número um sobre clusters privados: "Como eu rodo kubectl?" Aqui estão suas opções, ordenadas por praticidade:

### Opção 1: `az aks command invoke` (mais simples)

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

Bom para: Acesso de emergência, verificações rápidas, pipelines de CI/CD sem VPN.
Ruim para: Debugging interativo, uso intenso de kubectl, operações Helm com múltiplos arquivos.

### Opção 2: Azure Bastion + jump box

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

### Opção 3: VPN / ExpressRoute

Conecte sua rede corporativa a Azure VNet via VPN S2S ou ExpressRoute. Desenvolvedores rodam kubectl de suas estações de trabalho como se o API server fosse local.

### Opção 4: GitHub Actions com self-hosted runners

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

## Padrões de pipeline CI/CD para clusters privados

| Abordagem | Complexidade | Melhor Para |
|-----------|-------------|-------------|
| `az aks command invoke` | Baixa | Deployments simples, times pequenos |
| Self-hosted runners na VNet | Media | GitHub Actions, Azure DevOps |
| Agentes Azure DevOps em VMSS | Media | Pipelines Azure DevOps |
| Flux/ArgoCD (GitOps) | Media | Deployment pull-based (sem acesso ao API necessário a partir do CI) |
| Azure Deployment Environments | Baixa | Times de platform engineering |

:::tip

GitOps (Flux ou ArgoCD) e o padrão mais limpo para clusters privados. O agente GitOps roda dentro do cluster e puxa mudanças -- nenhum caminho de rede de entrada para o API server é necessário a partir do seu sistema de CI.
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

## Opções de zona de Private DNS

| Opção | Comportamento | Caso de Uso |
|-------|--------------|-------------|
| `system` | AKS cria e gerencia a zona | Cluster único, configuração simples |
| `none` | Sem private DNS, você gerencia a resolução | BYO DNS, resolução customizada |
| Resource ID | Usar zona de Private DNS existente | Hub-spoke, infraestrutura de DNS compartilhada |

Para topologias hub-spoke, use uma zona de Private DNS compartilhada no hub:

```bash
az aks create \
  --name prod-cluster \
  --resource-group prod-rg \
  --enable-private-cluster \
  --private-dns-zone /subscriptions/.../privateDnsZones/privatelink.eastus.azmk8s.io
```

## Erros comuns

1. **Não planejar resolução de DNS** -- Clusters privados exigem vinculação de zona de Private DNS a toda VNet que precisa de acesso. Esqueça uma VNet e o kubectl dá timeout.
2. **Bloquear `command invoke`** -- Alguns times desabilitam via Azure Policy sem fornecer um caminho de acesso alternativo. Não se tranque para fora.
3. **Esquecer acesso ao ACR** -- Clusters privados ainda precisam puxar imagens. Use Private Endpoint para o ACR ou vincule o ACR via managed identity.
4. **Pipelines de CI/CD sem caminho de rede** -- Seu runner do GitHub Actions não consegue acessar um API server privado. Planeje isso antes de ir para o privado.
5. **Misturar público e privado na mesma VNet** -- Se um cluster é privado, as expectativas de acesso entre peers ficam confusas. Seja consistente.

## Recursos

- [Private AKS Clusters](https://learn.microsoft.com/en-us/azure/aks/private-clusters)
- [API Server Authorized IP Ranges](https://learn.microsoft.com/en-us/azure/aks/api-server-authorized-ip-ranges)
- [AKS Command Invoke](https://learn.microsoft.com/en-us/azure/aks/access-private-cluster)
- [Flux GitOps on AKS](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/conceptual-gitops-flux2)
- [AKS Labs](https://azure-samples.github.io/aks-labs)

---

**Próximo**: [Service Mesh](./service-mesh) -- você realmente precisa de um?
