---
sidebar_position: 2
title: "Checklist de Hardening de Segurança"
description: "Hardening de segurança priorizado para AKS -- o que fazer primeiro, o que pode esperar"
---

# Checklist de Hardening de Segurança

Se você só fizer 3 coisas: desabilite contas locais, habilite network policies com default-deny e use Workload Identity. Todo o resto é defesa em profundidade sobre essa base.

## Matriz de prioridade

### Crítico (faça isso primeiro)

| Ação | Como | Impacto |
|------|------|---------|
| Desabilitar contas locais | `az aks update --disable-local-accounts` | Previne bypass da autenticação do Entra ID |
| Habilitar Workload Identity | Credenciais federadas, sem secrets nos pods | Elimina credenciais armazenadas |
| Network policies default-deny | Aplicar deny-all ingress/egress por namespace | Previne movimentação lateral |
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

Sem network policies default-deny, todo pod pode alcançar qualquer outro pod em qualquer porta. Um container comprometido em um namespace pode atacar bancos de dados em outro. Esta é a falha de segurança mais comum em clusters AKS.
:::

### Alta prioridade

| Ação | Como | Impacto |
|------|------|---------|
| Defender for Containers | Habilitar no Defender for Cloud | Detecção de ameaças em runtime, scan de vulnerabilidades |
| Azure Policy (restritiva) | Atribuir `Kubernetes cluster pods should only use allowed images` | Bloquear imagens não confiáveis |
| Pull de imagens apenas do ACR | Network policy + admission controller | Sem pull do Docker Hub em prod |
| Pod Security Admission | Aplicar perfil `restricted` | Bloquear containers privilegiados |
| Logs de auditoria | Diagnostic settings -> Log Analytics | Rastrear todas as operações do API server |

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

### Média prioridade

| Ação | Como | Impacto |
|------|------|---------|
| Assinatura de imagens (Ratify) | Notation + Ratify admission controller | Executar apenas imagens verificadas |
| Rotação de secrets | Key Vault + CSI driver com rotação | Rotacionar secrets automaticamente |
| Auto-upgrade do OS dos nodes | `--node-os-upgrade-channel SecurityPatch` | Patches de segurança automatizados |
| Limitar egress com Azure Firewall | Regras de FQDN para destinos permitidos | Bloquear exfiltração de dados |
| Habilitar mTLS com service mesh | Istio ambient mode ou Linkerd | Criptografar tráfego pod-to-pod |

## CIS Kubernetes benchmark

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

Não tente atingir 100% de compliance CIS no primeiro dia. Comece pelos itens Críticos, depois trabalhe nos de Alta prioridade, depois Média. Compliance perfeita sem workloads rodando não é um estado útil.
:::

## Segurança da cadeia de suprimentos

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

## Erros comuns

1. **Habilitar contas locais "para emergências"** -- Se o Entra ID cair, contas locais ignoram todo o RBAC. Use procedimentos de break-glass em vez disso.
2. **Network policies com defaults allow-all** -- O mesmo que não ter network policies.
3. **Armazenar secrets em Kubernetes Secrets** -- São codificados em base64, não criptografados em repouso por padrão. Use Key Vault.
4. **Rodar como root em containers** -- A maioria das imagens não precisa de root. Defina `runAsNonRoot: true`.
5. **Ignorar alertas do Defender** -- Fadiga de alertas é real, mas suprimir todos os alertas é pior.

:::tip Opinião

Segurança não é opcional. Um cluster comprometido pode fazer pivot para todo o seu tenant Azure via managed identity. Trate a segurança do AKS como segurança do tenant.
:::

## Recursos

- [Boas práticas de segurança do AKS](https://learn.microsoft.com/azure/aks/operator-best-practices-cluster-security)
- [CIS Benchmark para AKS](https://learn.microsoft.com/azure/aks/cis-kubernetes)
- [Visão geral do Workload Identity](https://learn.microsoft.com/azure/aks/workload-identity-overview)
- [Microsoft Defender for Containers](https://learn.microsoft.com/azure/defender-for-cloud/defender-for-containers-introduction)
