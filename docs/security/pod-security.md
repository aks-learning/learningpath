---
sidebar_position: 4
title: "Pod Security"
description: "Enforce Pod Security Standards with PSA and Azure Policy to prevent privileged containers and insecure configurations."
---

# Pod Security

Enforce the Restricted security profile in production namespaces. No exceptions without documented approval signed off by a security lead. A single privileged container is all an attacker needs to escape to the node and own your cluster.

## Pod Security Standards (PSS)

Kubernetes defines three security profiles. Only one is acceptable for production:

| Profile | What It Allows | When to Use |
|---------|---------------|-------------|
| Privileged | Everything. No restrictions. | System namespaces only (kube-system). Never for application workloads. |
| Baseline | Blocks known privilege escalations but allows some risky configs | Development environments as a minimum bar |
| Restricted | Blocks all dangerous configurations. Non-root, no capabilities, read-only root. | Production. Always. |

:::warning
Pod Security Policies (PSP) were removed in Kubernetes 1.25. If you are running anything referencing PSP, it is doing nothing. You must migrate to Pod Security Admission (PSA).
:::

## Pod Security Admission (PSA)

PSA is built into Kubernetes. No addon required. Apply it per-namespace with labels:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

For a rollout strategy, start with warn/audit and move to enforce after fixing violations:

```yaml
# Phase 1: See what breaks
labels:
  pod-security.kubernetes.io/audit: restricted
  pod-security.kubernetes.io/warn: restricted

# Phase 2: After fixing violations
labels:
  pod-security.kubernetes.io/enforce: restricted
```

## What Restricted Actually Requires

Your pod spec must comply with these rules. No negotiation:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
  namespace: production
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: myregistry.azurecr.io/myapp:latest
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      runAsNonRoot: true
      runAsUser: 1000
      capabilities:
        drop:
          - ALL
    volumeMounts:
    - name: tmp
      mountPath: /tmp
  volumes:
  - name: tmp
    emptyDir: {}
```

Key points:
- `runAsNonRoot: true` -- container process cannot run as UID 0
- `allowPrivilegeEscalation: false` -- no setuid/setgid binaries
- `readOnlyRootFilesystem: true` -- container cannot write to its filesystem (use emptyDir for temp files)
- `capabilities.drop: ALL` -- no Linux capabilities whatsoever
- `seccompProfile: RuntimeDefault` -- system calls are filtered

## Azure Policy: Belt and Suspenders

PSA enforces at the Kubernetes API level. Azure Policy enforces at the Azure resource level. Use both.

```bash
# Assign the built-in "Kubernetes cluster pods should only use allowed capabilities" initiative
az policy assignment create \
  --name "aks-pod-security-restricted" \
  --policy-set-definition "42b8ef37-b724-4e24-bbc8-7a7708edfe00" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/<cluster>" \
  --params '{"effect": {"value": "deny"}}'
```

:::tip
Use Azure Policy and PSA together. PSA catches violations at pod creation time in-cluster. Azure Policy catches violations through the Azure control plane and provides compliance reporting. They complement each other -- one is not a substitute for the other.
:::

Built-in Azure Policy initiatives for AKS pod security:
- `Kubernetes cluster should not allow privileged containers`
- `Kubernetes cluster containers should only use allowed capabilities`
- `Kubernetes cluster pods should only use approved host network and port range`
- `Kubernetes cluster containers should run with a read only root file system`

## Dealing with Exceptions

Some workloads genuinely need elevated permissions (monitoring agents, CNI plugins, log collectors). Handle them properly:

1. Keep them in dedicated namespaces (`kube-system`, `monitoring`)
2. Apply Baseline or Privileged PSA only to those specific namespaces
3. Document why each exception exists
4. Review exceptions quarterly -- many "required" privileges were needed once and forgotten

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
  labels:
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

This enforces baseline (blocks the worst offenders) while auditing against restricted (shows you what would fail if you tightened further).

## Common Mistakes

1. **Not setting seccompProfile** -- Missing seccomp means unrestricted system calls. Always set `RuntimeDefault` at minimum.
2. **Forgetting readOnlyRootFilesystem** -- Applications that write to the container filesystem (logs, temp files) break. Fix the app to write to mounted volumes instead.
3. **Running as root "because the image requires it"** -- Fix the Dockerfile. Add `USER 1000`. Most base images work fine as non-root.
4. **Applying Privileged to all namespaces "to avoid breaking things"** -- This disables all security. Start with audit/warn, fix violations, then enforce.
5. **Ignoring Azure Policy audit results** -- Non-compliant resources generate alerts. If you never look at them, you have no security posture visibility.

## Resources

- [Pod Security Admission in AKS](https://learn.microsoft.com/en-us/azure/aks/use-psa)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Azure Policy Built-in for AKS](https://learn.microsoft.com/en-us/azure/aks/policy-reference)
- [Kubernetes Seccomp Profiles](https://kubernetes.io/docs/tutorials/security/seccomp/)
