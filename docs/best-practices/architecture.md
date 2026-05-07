---
sidebar_position: 1
title: "Architecture Best Practices"
description: "Follow the AKS Baseline Architecture. Don't invent your own. Microsoft tested this at scale."
---

# Architecture Best Practices

Follow the AKS Baseline. Don't invent your own architecture. Microsoft tested this at scale with hundreds of enterprise customers.

## The AKS baseline architecture

The AKS Baseline is Microsoft's reference architecture for production Kubernetes. It covers networking, identity, security, operations, and deployment patterns. Start here, then customize.

:::tip Opinion

Start with the baseline, then customize for your needs. Not the other way around. Teams that design from scratch inevitably rediscover every problem the baseline already solved.
:::

## Key architectural principles

| Principle | Implementation | Why |
|-----------|---------------|-----|
| Private API server | `--enable-private-cluster` | Control plane not exposed to internet |
| Workload Identity | Federated identity, no secrets in pods | Zero stored credentials, auto-rotation |
| Network policies | Calico or Azure NPM, default-deny | Lateral movement prevention |
| Availability Zones | 3 zones for all node pools | Survive datacenter failure |
| GitOps | Flux or ArgoCD for deployments | Auditable, repeatable, recoverable |
| Managed Identity | System + User assigned identities | No service principal secrets to rotate |

## Hub-spoke network topology

![Hub-Spoke Network Topology](/img/hub-spoke-topology.svg)

The hub contains shared services (Azure Firewall, Bastion, DNS). Each spoke is an isolated workload environment. AKS lives in its own spoke with a dedicated subnet for pods and another for nodes.

## Baseline components

```bash
# The baseline includes all of these. Don't skip any for production:
- Azure Firewall (egress control)
- Azure Application Gateway + WAF (ingress)
- Azure Container Registry (private, geo-replicated)
- Azure Key Vault (secrets, certs)
- Azure Monitor + Log Analytics (observability)
- Microsoft Defender for Containers (security)
- Azure Policy (governance)
- Private DNS Zones (name resolution)
```

:::warning

Skipping Azure Firewall for egress means your cluster can reach any internet endpoint. One compromised pod can exfiltrate data anywhere. The firewall adds cost but is non-negotiable for regulated workloads.
:::

## Microservices on AKS

| Decision | Recommendation |
|----------|---------------|
| Namespace strategy | One namespace per service team |
| Resource isolation | ResourceQuotas per namespace |
| Network boundaries | NetworkPolicies between namespaces (default-deny) |
| Service communication | In-cluster DNS for internal, HTTPS for external |
| Secrets | External Secrets Operator + Key Vault, never Kubernetes Secrets directly |
| Configuration | ConfigMaps for non-sensitive, Key Vault for sensitive |

```yaml
# Resource quota per team namespace
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: payments-team
spec:
  hard:
    requests.cpu: "20"
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi
    persistentvolumeclaims: "10"
    services.loadbalancers: "2"
```

## Anti-patterns to avoid

1. **Public API server** -- Your control plane is on the internet. Use private cluster.
2. **Single namespace for all workloads** -- No isolation, no quotas, one team can starve another.
3. **Service principals with secrets** -- Use managed identity. Secrets expire and leak.
4. **No network policies** -- Every pod can talk to every other pod. One breach compromises everything.
5. **Deploying directly with kubectl** -- No audit trail, no rollback, no reproducibility. Use GitOps.
6. **No egress filtering** -- Compromised pods can phone home to any C2 server.

:::info

The AKS Baseline reference implementation is fully deployable. Clone the repo, customize parameters, deploy. Don't build from scratch.
:::

## Resources

- [AKS Baseline Architecture](https://learn.microsoft.com/azure/architecture/reference-architectures/containers/aks/baseline-aks)
- [AKS Baseline GitHub (reference implementation)](https://github.com/mspnp/aks-baseline)
- [AKS Landing Zone Accelerator](https://github.com/Azure/AKS-Landing-Zone-Accelerator)
- [Well-Architected Framework for AKS](https://learn.microsoft.com/azure/well-architected/service-guides/azure-kubernetes-service)
