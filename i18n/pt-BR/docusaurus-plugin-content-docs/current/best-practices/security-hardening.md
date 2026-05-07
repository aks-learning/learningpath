---
sidebar_position: 2
title: "Checklist de Hardening de Seguranca"
description: "Hardening de seguranca priorizado para AKS -- o que fazer primeiro, o que pode esperar"
---

# Checklist de Hardening de Seguranca

Se voce so fizer 3 coisas: desabilite contas locais, habilite network policies com default-deny e use Workload Identity. Todo o resto e defesa em profundidade sobre essa base.

## Matriz de Prioridade

### Critico (Faca Isso Primeiro)

| Acao | Como | Impacto |
|------|------|---------|
| Desabilitar contas locais | `az aks update --disable-local-accounts` | Previne bypass da autenticacao do Entra ID |
| Habilitar Workload Identity | Credenciais federadas, sem secrets nos pods | Elimina credenciais armazenadas |
| Network policies default-deny | Aplicar deny-all ingress/egress por namespace | Previne movimentacao lateral |
| API server privado | `--enable-private-cluster` | Control plane fora da internet |
| Desabilitar SSH nos nodes | `--disable-ssh` no node pool | Sem acesso backdoor aos nodes |

```yaml
# Default deny all ingress and egress in a namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

:::warning

Sem network policies default-deny, todo pod pode alcancar qualquer outro pod em qualquer porta. Um container comprometido em um namespace pode atacar bancos de dados em outro. Esta e a falha de seguranca mais comum em clusters AKS.
:::

### Alta Prioridade

| Acao | Como | Impacto |
|------|------|---------|
| Defender for Containers | Habilitar no Defender for Cloud | Deteccao de ameacas em runtime, scan de vulnerabilidades |
| Azure Policy (restritiva) | Atribuir `Kubernetes cluster pods should only use allowed images` | Bloquear imagens nao confiaveis |
| Pull de imagens apenas do ACR | Network policy + admission controller | Sem pull do Docker Hub em prod |
| Pod Security Admission | Aplicar perfil `restricted` | Bloquear containers privilegiados |
| Logs de auditoria | Diagnostic settings -> Log Analytics | Rastrear todas as operacoes do API server |

```bash
# Enable Defender for Containers
az security pricing create \
  --name Containers \
  --tier Standard

# Assign built-in Azure Policy initiative
az policy assignment create \
  --name 'aks-baseline-security' \
  --policy-set-definition '42b8ef37-b724-4e24-bbc8-7a7708edfe00' \
  --scope "/subscriptions/{sub-id}/resourceGroups/{rg}"
```

### Media Prioridade

| Acao | Como | Impacto |
|------|------|---------|
| Assinatura de imagens (Ratify) | Notation + Ratify admission controller | Executar apenas imagens verificadas |
| Rotacao de secrets | Key Vault + CSI driver com rotacao | Rotacionar secrets automaticamente |
| Auto-upgrade do OS dos nodes | `--node-os-upgrade-channel SecurityPatch` | Patches de seguranca automatizados |
| Limitar egress com Azure Firewall | Regras de FQDN para destinos permitidos | Bloquear exfiltracao de dados |
| Habilitar mTLS com service mesh | Istio ambient mode ou Linkerd | Criptografar trafego pod-to-pod |

## CIS Kubernetes Benchmark

O Azure Policy inclui o benchmark CIS como uma initiative integrada. Atribua-a para obter scores de compliance.

```bash
# Check current compliance
az policy state list \
  --resource-group myrg \
  --resource-type Microsoft.ContainerService/managedClusters \
  --query "[?complianceState=='NonCompliant'].{policy:policyDefinitionName, reason:complianceState}" \
  --output table
```

:::info

Nao tente atingir 100% de compliance CIS no primeiro dia. Comece pelos itens Criticos, depois trabalhe nos de Alta prioridade, depois Media. Compliance perfeita sem workloads rodando nao e um estado util.
:::

## Seguranca da Cadeia de Suprimentos

```bash
# Scan images before deployment (in CI/CD pipeline)
az acr task run \
  --registry myacr \
  --name scan-image \
  --image myapp:latest

# Block unsigned images with Ratify
# Install Ratify via Helm, configure notation verifier
helm install ratify ratify/ratify \
  --namespace gatekeeper-system \
  --set featureFlags.RATIFY_CERT_ROTATION=true
```

## Erros Comuns

1. **Habilitar contas locais "para emergencias"** -- Se o Entra ID cair, contas locais ignoram todo o RBAC. Use procedimentos de break-glass em vez disso.
2. **Network policies com defaults allow-all** -- O mesmo que nao ter network policies.
3. **Armazenar secrets em Kubernetes Secrets** -- Sao codificados em base64, nao criptografados em repouso por padrao. Use Key Vault.
4. **Rodar como root em containers** -- A maioria das imagens nao precisa de root. Defina `runAsNonRoot: true`.
5. **Ignorar alertas do Defender** -- Fadiga de alertas e real, mas suprimir todos os alertas e pior.

:::tip Opiniao

Seguranca nao e opcional. Um cluster comprometido pode fazer pivot para todo o seu tenant Azure via managed identity. Trate a seguranca do AKS como seguranca do tenant.
:::

## Recursos

- [Boas praticas de seguranca do AKS](https://learn.microsoft.com/azure/aks/operator-best-practices-cluster-security)
- [CIS Benchmark para AKS](https://learn.microsoft.com/azure/aks/cis-kubernetes)
- [Visao geral do Workload Identity](https://learn.microsoft.com/azure/aks/workload-identity-overview)
- [Microsoft Defender for Containers](https://learn.microsoft.com/azure/defender-for-cloud/defender-for-containers-introduction)
