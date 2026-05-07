---
sidebar_position: 4
title: "Multi-tenancy and governance"
description: "Isolate teams and workloads on shared AKS clusters using namespaces, RBAC, network policies, resource quotas, and Azure Policy."
---

# Multi-tenancy and governance

Most organizations should run fewer, larger clusters instead of one cluster per team. Multi-tenancy makes that work without teams stepping on each other. A well-governed shared cluster is cheaper, easier to patch, and simpler to monitor — but without guardrails it becomes the wild west within weeks.

## Tenancy models

Pick one model and stick with it. Mixing models in the same cluster creates confusion.

| Model | When to use | Isolation level |
|---|---|---|
| **Namespace-per-team** | Default choice. Teams share a cluster, each gets a namespace with quotas and RBAC. | Logical |
| **Namespace-per-environment** | Small orgs where one team owns dev/staging/prod namespaces in the same cluster. | Logical |
| **Cluster-per-tenant** | Regulatory requirements (PCI, HIPAA), zero-trust between tenants, or GPU workloads that need full node control. | Physical |

Use namespace-per-team unless you have a documented reason not to. Cluster-per-tenant doubles your operational burden.

:::tip

Start with namespace-per-team. You can promote a tenant to their own cluster later. Going the other direction is painful.

:::

## Namespace isolation checklist

Every new tenant namespace needs all five of these. Skip one and you have a gap.

| # | Resource | Purpose |
|---|---|---|
| 1 | `ResourceQuota` | Caps total CPU, memory, storage, and object counts |
| 2 | `LimitRange` | Sets default requests/limits so no pod runs unbounded |
| 3 | `NetworkPolicy` | Denies all traffic by default, then allows specific flows |
| 4 | `RoleBinding` | Scoped RBAC — team members get only namespace-level access |
| 5 | Entra ID group mapping | Bind roles to Azure AD groups, not individual users |

## Resource quotas and LimitRange

Without quotas, one team can consume the entire cluster. Set quotas on day one, not after an incident.

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

If you set a `ResourceQuota` on CPU or memory, every pod in that namespace must specify requests and limits. Pods without them will be rejected. Always pair quotas with a `LimitRange` to set defaults.

:::

## Network policies

Use Azure CNI with Cilium or Calico — not kubenet. Kubenet does not enforce network policies. Apply a deny-all policy first, then punch holes for DNS and your ingress controller:

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

Test network policies in staging first. A misconfigured egress policy that blocks DNS will take down every workload in the namespace instantly.

:::

## RBAC patterns

Use built-in ClusterRoles for permissions, namespace-scoped RoleBindings for access. Never grant `cluster-admin` to application teams.

| Role | Built-in ClusterRole | Can do | Cannot do |
|---|---|---|---|
| **Team admin** | `admin` | Deployments, services, configmaps, secrets, HPA | Modify quotas, network policies, or RBAC |
| **Developer** | `edit` | Deploy workloads, view logs, exec into pods | Delete PVs, modify LoadBalancer services |
| **Viewer** | `view` | Read all resources, view logs | Create, update, or delete anything |

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: team-alpha-admin, namespace: team-alpha }
subjects:
  - kind: Group
    name: "<entra-group-object-id>"
    apiGroup: rbac.authorization.k8s.io
roleRef: { kind: ClusterRole, name: admin, apiGroup: rbac.authorization.k8s.io }
# Swap 'admin' to 'edit' (developer) or 'view' (read-only)
```

:::warning

Bind roles to Entra ID groups, not individual users. When someone leaves or changes teams, you update group membership in one place instead of hunting through RoleBindings.

:::

## Azure Policy for AKS

Use built-in policy initiatives — do not write custom policies until you have exhausted the built-in library.

| Policy | Effect | Why |
|---|---|---|
| **Pod security baseline** initiative | Deny | Blocks privileged containers, host networking, host PID/IPC |
| Container images from allowed registries only | Deny | Prevents pulling from Docker Hub or unknown registries |
| Containers must have resource limits | Deny | Belt and suspenders on top of LimitRange |
| Containers must not run as root | Audit, then Deny | Start with audit to find violations, flip to deny once clean |
| Pods must use approved labels | Audit | Required for cost allocation |

```bash
az policy assignment create \
  --name "aks-pod-security-baseline" \
  --policy-set-definition "a8640138-9b0a-4a28-b8cb-1666c838647d" \
  --scope "/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/<cluster>" \
  --params '{"effect": {"value": "Deny"}}'
```

## Cost allocation

You cannot split costs if you cannot attribute resources to teams. Enable the cost analysis add-on before onboarding the second tenant:

```bash
az aks update --resource-group <rg> --name <cluster> --enable-cost-analysis
```

Enforce these labels on every namespace via Azure Policy:

| Label | Example | Purpose |
|---|---|---|
| `cost-center` | `cc-12345` | Maps to finance cost center |
| `team` | `platform-engineering` | Ownership |
| `environment` | `production` | Distinguishes prod from dev spend |

:::tip

Use Azure Policy to deny namespaces missing the `cost-center` and `team` labels. Without enforcement, label discipline decays within weeks.

:::

## Node pool isolation

Use dedicated node pools when logical isolation is not enough.

| Scenario | Recommendation |
|---|---|
| GPU workloads | Dedicated pool with GPU VMs and `NoSchedule` taints |
| Compliance-sensitive tenants | Dedicated pool, no shared scheduling |
| Noisy neighbors | Taint a pool, tolerate only the noisy workload |
| Burstable dev/test | B-series pool, autoscaler minimum zero |

```bash
az aks nodepool add \
  --resource-group <rg> --cluster-name <cluster> --name gpupool \
  --node-count 2 --node-vm-size Standard_NC6s_v3 \
  --node-taints "sku=gpu:NoSchedule" --labels team=ml-team
```

Pods targeting this pool need a toleration and node selector:

```yaml
tolerations:
  - { key: "sku", operator: "Equal", value: "gpu", effect: "NoSchedule" }
nodeSelector: { team: ml-team }
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| No resource quotas | One team's leak OOM-kills cluster-wide | `ResourceQuota` on every namespace |
| Overly permissive RBAC | Devs delete other teams' resources | Namespace-scoped `RoleBinding` only |
| No network policies | Any pod reaches any pod | Default deny-all per namespace |
| Shared service accounts | Cannot audit who did what | One SA per workload |
| RBAC bound to users | Stale accounts, sprawl | Entra ID groups exclusively |
| No LimitRange with quota | Pods rejected on deploy | Always pair both |

## New team onboarding template

Run this once per team. It creates the namespace with all five isolation primitives.

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

## Resources

- [AKS multi-tenancy best practices](https://learn.microsoft.com/en-us/azure/aks/best-practices-multi-tenancy)
- [Resource quotas in AKS](https://learn.microsoft.com/en-us/azure/aks/operator-best-practices-scheduler#enforce-resource-quotas)
- [Network policies in AKS](https://learn.microsoft.com/en-us/azure/aks/use-network-policies)
- [Azure Policy for AKS](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/policy-for-kubernetes)
- [AKS cost analysis](https://learn.microsoft.com/en-us/azure/aks/cost-analysis)
- [AKS RBAC with Entra ID](https://learn.microsoft.com/en-us/azure/aks/manage-azure-rbac)
- [Limit ranges](https://learn.microsoft.com/en-us/azure/aks/operator-best-practices-scheduler#limit-ranges)
- [Node pool isolation](https://learn.microsoft.com/en-us/azure/aks/use-multiple-node-pools)
