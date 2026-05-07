---
sidebar_position: 2
title: "Security Hardening Checklist"
description: "Prioritized security hardening for AKS -- what to do first, what can wait"
---

# Security Hardening Checklist

If you only do 3 things: disable local accounts, enable network policies with default-deny, and use Workload Identity. Everything else is defense-in-depth on top of these.

## Priority Matrix

### Critical (Do These First)

| Action | How | Impact |
|--------|-----|--------|
| Disable local accounts | `az aks update --disable-local-accounts` | Prevents bypass of Entra ID auth |
| Enable Workload Identity | Federated credentials, no secrets in pods | Eliminates stored credentials |
| Network policies default-deny | Apply deny-all ingress/egress per namespace | Prevents lateral movement |
| Private API server | `--enable-private-cluster` | Control plane off internet |
| Disable SSH to nodes | `--disable-ssh` on node pool | No backdoor access to nodes |

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
Without default-deny network policies, every pod can reach every other pod on any port. A compromised container in one namespace can attack databases in another. This is the single most common security gap in AKS clusters.
:::

### High Priority

| Action | How | Impact |
|--------|-----|--------|
| Defender for Containers | Enable in Defender for Cloud | Runtime threat detection, vuln scanning |
| Azure Policy (restricted) | Assign `Kubernetes cluster pods should only use allowed images` | Block untrusted images |
| ACR-only image pulls | Network policy + admission controller | No pulling from Docker Hub in prod |
| Pod Security Admission | Enforce `restricted` profile | Block privileged containers |
| Audit logging | Diagnostic settings → Log Analytics | Track all API server operations |

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

### Medium Priority

| Action | How | Impact |
|--------|-----|--------|
| Image signing (Ratify) | Notation + Ratify admission controller | Only run verified images |
| Secret rotation | Key Vault + CSI driver with rotation | Auto-rotate secrets |
| Node OS auto-upgrade | `--node-os-upgrade-channel SecurityPatch` | Automated security patches |
| Limit egress with Azure Firewall | FQDN rules for allowed destinations | Block data exfiltration |
| Enable mTLS with service mesh | Istio ambient mode or Linkerd | Encrypt pod-to-pod traffic |

## CIS Kubernetes Benchmark

Azure Policy includes the CIS benchmark as a built-in initiative. Assign it to get compliance scores.

```bash
# Check current compliance
az policy state list \
  --resource-group myrg \
  --resource-type Microsoft.ContainerService/managedClusters \
  --query "[?complianceState=='NonCompliant'].{policy:policyDefinitionName, reason:complianceState}" \
  --output table
```

:::info
Don't try to hit 100% CIS compliance on day one. Start with Critical items, then work through High, then Medium. Perfect compliance with no workloads running is not a useful state.
:::

## Supply Chain Security

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

## Common Mistakes

1. **Enabling local accounts "for emergencies"** -- If Entra ID is down, local accounts bypass all RBAC. Use break-glass procedures instead.
2. **Network policies with allow-all defaults** -- Same as no network policies.
3. **Storing secrets in Kubernetes Secrets** -- They're base64-encoded, not encrypted at rest by default. Use Key Vault.
4. **Running as root in containers** -- Most images don't need root. Set `runAsNonRoot: true`.
5. **Ignoring Defender alerts** -- Alert fatigue is real but suppressing all alerts is worse.

:::tip Opinion
Security is not optional. A compromised cluster can pivot to your entire Azure tenant via managed identity. Treat AKS security as tenant security.
:::

## Resources

- [AKS security best practices](https://learn.microsoft.com/azure/aks/operator-best-practices-cluster-security)
- [CIS Benchmark for AKS](https://learn.microsoft.com/azure/aks/cis-kubernetes)
- [Workload Identity overview](https://learn.microsoft.com/azure/aks/workload-identity-overview)
- [Microsoft Defender for Containers](https://learn.microsoft.com/azure/defender-for-cloud/defender-for-containers-introduction)
