---
sidebar_position: 4
title: "Multi-tenancy e governança"
description: "Isole equipes e cargas de trabalho em clusters AKS compartilhados usando namespaces, RBAC, network policies, resource quotas e Azure Policy."
---

# Multi-tenancy e governança

A maioria das organizações deveria executar menos clusters, porém maiores, em vez de um cluster por equipe. Multi-tenancy faz isso funcionar sem que as equipes interfiram umas nas outras. Um cluster compartilhado bem governado é mais barato, mais fácil de aplicar patches e mais simples de monitorar — mas sem proteções ele se torna um caos em semanas.

## Modelos de tenancy

Escolha um modelo e mantenha-o. Misturar modelos no mesmo cluster gera confusão.

| Modelo | Quando usar | Nível de isolamento |
|---|---|---|
| **Namespace por equipe** | Escolha padrão. Equipes compartilham um cluster, cada uma recebe um namespace com quotas e RBAC. | Lógico |
| **Namespace por ambiente** | Organizações pequenas onde uma equipe gerencia namespaces de dev/staging/prod no mesmo cluster. | Lógico |
| **Cluster por tenant** | Requisitos regulatórios (PCI, HIPAA), zero-trust entre tenants ou cargas de trabalho GPU que precisam de controle total dos nós. | Físico |

Use namespace por equipe a menos que tenha uma razão documentada para não usar. Cluster por tenant dobra sua carga operacional.

:::tip

Comece com namespace por equipe. Você pode promover um tenant para seu próprio cluster depois. Ir na direção contrária é doloroso.

:::

## Checklist de isolamento de namespace

Todo novo namespace de tenant precisa de todos os cinco itens. Pule um e você terá uma lacuna.

| # | Recurso | Propósito |
|---|---|---|
| 1 | `ResourceQuota` | Limita CPU total, memória, armazenamento e contagem de objetos |
| 2 | `LimitRange` | Define requests/limits padrão para que nenhum pod execute sem limites |
| 3 | `NetworkPolicy` | Nega todo tráfego por padrão, depois permite fluxos específicos |
| 4 | `RoleBinding` | RBAC com escopo — membros da equipe recebem apenas acesso a nível de namespace |
| 5 | Mapeamento de grupo Entra ID | Vincule roles a grupos Azure AD, não a usuários individuais |

## Resource quotas e LimitRange

Sem quotas, uma equipe pode consumir o cluster inteiro. Defina quotas no primeiro dia, não após um incidente.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-alpha-quota
  namespace: team-alpha
spec:
  hard:
    requests.cpu: "8"
    requests.memory: 16Gi
    limits.cpu: "16"
    limits.memory: 32Gi
    persistentvolumeclaims: "10"
    pods: "50"
    services.loadbalancers: "2"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: team-alpha
spec:
  limits:
    - default:        { cpu: 500m, memory: 512Mi }
      defaultRequest: { cpu: 100m, memory: 128Mi }
      max:            { cpu: "2",  memory: 4Gi }
      min:            { cpu: 50m,  memory: 64Mi }
      type: Container
```

:::warning

Se você definir um `ResourceQuota` para CPU ou memória, cada pod naquele namespace deve especificar requests e limits. Pods sem eles serão rejeitados. Sempre combine quotas com um `LimitRange` para definir valores padrão.

:::

## Network policies

Use Azure CNI com Cilium ou Calico — não kubenet. Kubenet não aplica network policies. Aplique uma política deny-all primeiro, depois abra exceções para DNS e seu ingress controller:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: deny-all, namespace: team-alpha }
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-dns, namespace: team-alpha }
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - to: [{ namespaceSelector: {} }]
      ports: [{ protocol: UDP, port: 53 }, { protocol: TCP, port: 53 }]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-ingress-controller, namespace: team-alpha }
spec:
  podSelector: {}
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: ingress-system }
```

:::info

Teste network policies em staging primeiro. Uma política de egress mal configurada que bloqueia DNS derrubará todas as cargas de trabalho no namespace instantaneamente.

:::

## Padrões RBAC

Use ClusterRoles integrados para permissões, RoleBindings com escopo de namespace para acesso. Nunca conceda `cluster-admin` para equipes de aplicação.

| Função | ClusterRole integrado | Pode fazer | Não pode fazer |
|---|---|---|---|
| **Admin da equipe** | `admin` | Deployments, services, configmaps, secrets, HPA | Modificar quotas, network policies ou RBAC |
| **Desenvolvedor** | `edit` | Implantar cargas de trabalho, ver logs, exec em pods | Excluir PVs, modificar services LoadBalancer |
| **Visualizador** | `view` | Ler todos os recursos, ver logs | Criar, atualizar ou excluir qualquer coisa |

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: team-alpha-admin, namespace: team-alpha }
subjects:
  - kind: Group
    name: "<entra-group-object-id>"
    apiGroup: rbac.authorization.k8s.io
roleRef: { kind: ClusterRole, name: admin, apiGroup: rbac.authorization.k8s.io }
# Troque 'admin' por 'edit' (desenvolvedor) ou 'view' (somente leitura)
```

:::warning

Vincule roles a grupos Entra ID, não a usuários individuais. Quando alguém sai ou muda de equipe, você atualiza a associação ao grupo em um único lugar em vez de procurar em RoleBindings.

:::

## Azure Policy para AKS

Use iniciativas de política integradas — não escreva políticas customizadas até esgotar a biblioteca integrada.

| Política | Efeito | Por quê |
|---|---|---|
| Iniciativa **Pod security baseline** | Deny | Bloqueia containers privilegiados, host networking, host PID/IPC |
| Imagens de container apenas de registros permitidos | Deny | Impede pull do Docker Hub ou registros desconhecidos |
| Containers devem ter limites de recursos | Deny | Reforço adicional sobre o LimitRange |
| Containers não devem executar como root | Audit, depois Deny | Comece com audit para encontrar violações, mude para deny quando estiver limpo |
| Pods devem usar labels aprovados | Audit | Necessário para alocação de custos |

```bash
az policy assignment create \
  --name "aks-pod-security-baseline" \
  --policy-set-definition "a8640138-9b0a-4a28-b8cb-1666c838647d" \
  --scope "/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/<cluster>" \
  --params '{"effect": {"value": "Deny"}}'
```

## Alocação de custos

Você não pode dividir custos se não pode atribuir recursos às equipes. Habilite o add-on de análise de custos antes de integrar o segundo tenant:

```bash
az aks update --resource-group <rg> --name <cluster> --enable-cost-analysis
```

Aplique estes labels em cada namespace via Azure Policy:

| Label | Exemplo | Propósito |
|---|---|---|
| `cost-center` | `cc-12345` | Mapeia para o centro de custo financeiro |
| `team` | `platform-engineering` | Propriedade |
| `environment` | `production` | Distingue gasto de produção do de dev |

:::tip

Use Azure Policy para negar namespaces sem os labels `cost-center` e `team`. Sem aplicação, a disciplina de labels se deteriora em semanas.

:::

## Isolamento de node pool

Use node pools dedicados quando isolamento lógico não é suficiente.

| Cenário | Recomendação |
|---|---|
| Cargas de trabalho GPU | Pool dedicado com VMs GPU e taints `NoSchedule` |
| Tenants sensíveis a compliance | Pool dedicado, sem agendamento compartilhado |
| Vizinhos ruidosos | Adicione taint a um pool, tolere apenas a carga de trabalho ruidosa |
| Dev/test com burst | Pool B-series, mínimo do autoscaler em zero |

```bash
az aks nodepool add \
  --resource-group <rg> --cluster-name <cluster> --name gpupool \
  --node-count 2 --node-vm-size Standard_NC6s_v3 \
  --node-taints "sku=gpu:NoSchedule" --labels team=ml-team
```

Pods direcionados a este pool precisam de uma toleration e node selector:

```yaml
tolerations:
  - { key: "sku", operator: "Equal", value: "gpu", effect: "NoSchedule" }
nodeSelector: { team: ml-team }
```

## Erros comuns

| Erro | Consequência | Correção |
|---|---|---|
| Sem resource quotas | Vazamento de uma equipe causa OOM-kill em todo o cluster | `ResourceQuota` em cada namespace |
| RBAC excessivamente permissivo | Devs excluem recursos de outras equipes | Apenas `RoleBinding` com escopo de namespace |
| Sem network policies | Qualquer pod alcança qualquer pod | Deny-all padrão por namespace |
| Service accounts compartilhados | Não é possível auditar quem fez o quê | Um SA por carga de trabalho |
| RBAC vinculado a usuários | Contas obsoletas, proliferação | Exclusivamente grupos Entra ID |
| Sem LimitRange com quota | Pods rejeitados no deploy | Sempre combine ambos |

## Template de onboarding de nova equipe

Execute isso uma vez por equipe. Ele cria o namespace com todos os cinco primitivos de isolamento.

```bash
#!/bin/bash
set -euo pipefail
NS="${1:?Usage: $0 <namespace> <admin-group-id> <viewer-group-id>}"
ADMIN="${2:?Provide Entra admin group object ID}"
VIEWER="${3:?Provide Entra viewer group object ID}"

kubectl create namespace "$NS" --dry-run=client -o yaml | \
  kubectl label --local -f - cost-center="CHANGE-ME" team="$NS" environment="production" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -n "$NS" -f - <<EOF
apiVersion: v1
kind: ResourceQuota
metadata: { name: quota }
spec:
  hard: { requests.cpu: "8", requests.memory: 16Gi, limits.cpu: "16", limits.memory: 32Gi, pods: "50", services.loadbalancers: "2" }
---
apiVersion: v1
kind: LimitRange
metadata: { name: default-limits }
spec:
  limits:
    - default:        { cpu: 500m, memory: 512Mi }
      defaultRequest: { cpu: 100m, memory: 128Mi }
      max:            { cpu: "2",  memory: 4Gi }
      min:            { cpu: 50m,  memory: 64Mi }
      type: Container
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: deny-all }
spec: { podSelector: {}, policyTypes: [Ingress, Egress] }
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-dns }
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
    - to: [{ namespaceSelector: {} }]
      ports: [{ protocol: UDP, port: 53 }, { protocol: TCP, port: 53 }]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: admin }
subjects: [{ kind: Group, name: "$ADMIN", apiGroup: rbac.authorization.k8s.io }]
roleRef: { kind: ClusterRole, name: admin, apiGroup: rbac.authorization.k8s.io }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: viewers }
subjects: [{ kind: Group, name: "$VIEWER", apiGroup: rbac.authorization.k8s.io }]
roleRef: { kind: ClusterRole, name: view, apiGroup: rbac.authorization.k8s.io }
EOF

echo "Done. Update cost-center: kubectl label ns $NS cost-center=<value> --overwrite"
```

## Recursos

- [Boas práticas de multi-tenancy no AKS](https://learn.microsoft.com/en-us/azure/aks/best-practices-multi-tenancy)
- [Resource quotas no AKS](https://learn.microsoft.com/en-us/azure/aks/operator-best-practices-scheduler#enforce-resource-quotas)
- [Network policies no AKS](https://learn.microsoft.com/en-us/azure/aks/use-network-policies)
- [Azure Policy para AKS](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/policy-for-kubernetes)
- [Análise de custos no AKS](https://learn.microsoft.com/en-us/azure/aks/cost-analysis)
- [RBAC no AKS com Entra ID](https://learn.microsoft.com/en-us/azure/aks/manage-azure-rbac)
- [Limit ranges](https://learn.microsoft.com/en-us/azure/aks/operator-best-practices-scheduler#limit-ranges)
- [Isolamento de node pool](https://learn.microsoft.com/en-us/azure/aks/use-multiple-node-pools)
