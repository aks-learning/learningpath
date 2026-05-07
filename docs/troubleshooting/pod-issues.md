---
sidebar_position: 1
title: "Pod troubleshooting"
description: "Decision trees for the most common pod failures: Pending, CrashLoopBackOff, ImagePullBackOff, OOMKilled, and stuck terminating."
---

# Pod troubleshooting

Your pod is not running. This page tells you why and what to do about it. Start with the status you see in `kubectl get pods`, follow the decision tree, fix the issue.

## Start here

```bash
kubectl get pods -n <namespace> -o wide
kubectl describe pod <pod-name> -n <namespace>
```

The `describe` output has the answer 95% of the time. Look at the **Events** section at the bottom.

---

## Pending

The pod exists but no node will accept it.

### Decision tree

**1. Check events for scheduling failures:**
```bash
kubectl describe pod <pod> -n <ns> | grep -A 5 "Events:"
```

**2. What does the event say?**

| Event message | Cause | Fix |
|---|---|---|
| `Insufficient cpu` or `Insufficient memory` | Node has no room for the pod's resource requests | Reduce requests, add nodes, or increase max-count on autoscaler |
| `0/N nodes are available: N node(s) had taint` | Pod does not tolerate node taints | Add the correct toleration to the pod spec |
| `0/N nodes are available: N node(s) didn't match Pod's node affinity/selector` | Node affinity or nodeSelector does not match any node | Fix the label selector or add a node pool with matching labels |
| `persistentvolumeclaim "X" not found` | PVC does not exist or is in a different namespace | Create the PVC in the correct namespace |
| `0/N nodes are available: N pod has unbound immediate PersistentVolumeClaims` | PV cannot be provisioned | Check StorageClass exists, disk quota, zone mismatch |
| `Too many pods` | Node hit max pod limit (default 110 on kubenet, 250 on Azure CNI Overlay) | Use fewer pods per node or add nodes |

**3. Cluster Autoscaler not scaling up?**
```bash
kubectl -n kube-system get configmap cluster-autoscaler-status -o yaml
kubectl -n kube-system logs -l app=cluster-autoscaler --tail=50
```

Common reasons: max-count reached, pod has a nodeSelector that no pool satisfies, pod requests more resources than any VM SKU can provide.

:::tip

If a pod is Pending and the autoscaler is not responding, check if the pod has `nodeSelector` or `affinity` rules that match a node pool with `min-count: 0` and `max-count: 0`. The autoscaler cannot create nodes in a pool with max-count 0.
:::

---

## CrashLoopBackOff

The container starts, runs for a few seconds, then exits. Kubernetes restarts it with exponential backoff (10s, 20s, 40s, up to 5 min).

### Decision tree

**1. Get the logs from the last crash:**
```bash
kubectl logs <pod> -n <ns> --previous
```

**2. Check the exit code:**
```bash
kubectl describe pod <pod> -n <ns> | grep -A 3 "Last State"
```

| Exit code | Meaning | Most common cause |
|-----------|---------|-------------------|
| 0 | Graceful exit | Application completed and exited. If this is a web server, it should not exit. Check the entrypoint. |
| 1 | Application error | Unhandled exception, missing config file, wrong database URL |
| 127 | Command not found | Wrong `command` or `args` in the container spec. The binary does not exist in the image. |
| 137 | OOMKilled (SIGKILL) | Container exceeded its memory limit. See OOMKilled section below. |
| 139 | Segfault (SIGSEGV) | Application bug. Check core dumps. |
| 143 | SIGTERM | Graceful shutdown signal. If the container restarts after this, check liveness probe. |

**3. Common fixes:**

- **Missing environment variable or secret**: Check `kubectl describe pod` for `CreateContainerConfigError` events. Verify all referenced secrets and configmaps exist.
- **Liveness probe failing**: The probe kills a healthy-but-slow container. Increase `initialDelaySeconds` and `periodSeconds`.
- **Application needs time to start**: Add a `startupProbe` with generous timeout before the liveness probe kicks in.

```yaml
startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
  # Gives the app 300 seconds (5 min) to start
```

:::warning

Do not "fix" CrashLoopBackOff by removing the liveness probe. The probe is telling you the app is unhealthy. Fix the app.
:::

---

## ImagePullBackOff

Kubernetes cannot download the container image.

### Decision tree

**1. Check the exact error:**
```bash
kubectl describe pod <pod> -n <ns> | grep -A 3 "Failed"
```

| Error message | Cause | Fix |
|---|---|---|
| `repository does not exist or may require authorization` | Wrong image name or private registry without auth | Verify image name, attach ACR with `az aks update --attach-acr` |
| `unauthorized: authentication required` | Registry credentials missing or expired | For ACR, use `az aks check-acr`. For Docker Hub, create an `imagePullSecret` |
| `manifest unknown` | Tag does not exist in the registry | Check available tags with `az acr repository show-tags --name myACR --repository myapp` |
| `ErrImagePull` followed by `Back-off` | Transient network issue or rate limit | Wait and retry. Docker Hub rate limits anonymous pulls to 100/6h. Use ACR. |

**2. ACR-specific checks:**
```bash
# Verify ACR is attached
az aks check-acr --resource-group myRG --name myAKS --acr myACR.azurecr.io

# If not attached
az aks update --resource-group myRG --name myAKS --attach-acr myACR

# Verify the image exists
az acr repository show-tags --name myACR --repository myapp -o tsv
```

**3. Using imagePullSecrets (non-ACR registries):**
```bash
kubectl create secret docker-registry my-reg-cred \
  --docker-server=registry.example.com \
  --docker-username=user \
  --docker-password=pass \
  -n <namespace>
```

Then reference it in the pod spec:
```yaml
spec:
  imagePullSecrets:
  - name: my-reg-cred
```

---

## OOMKilled

The container used more memory than its limit allows. The kernel kills it with signal 137.

### Decision tree

**1. Confirm it is OOMKilled:**
```bash
kubectl describe pod <pod> -n <ns> | grep -E "OOMKilled|Exit Code: 137"
```

**2. Check current memory usage vs limit:**
```bash
kubectl top pod <pod> -n <ns> --containers
```

**3. Decide the fix:**

| Situation | Fix |
|---|---|
| App genuinely needs more memory | Increase `resources.limits.memory`. But also investigate if there is a leak. |
| Memory limit is way too low | Set limit to 1.5-2x the typical usage. Use VPA in recommendation mode to find the right value. |
| Memory leak (usage grows over time) | Fix the application. Common causes: unbounded caches, connection pool leaks, large file processing without streaming. |
| JVM app killed despite `-Xmx` being set | JVM uses more memory than heap alone (thread stacks, metaspace, native buffers). Set limit to `Xmx + 500Mi` at minimum. |

**4. Use VPA for right-sizing recommendations:**
```bash
# Install VPA and set it to recommendation-only mode
# Then check recommendations
kubectl get vpa -n <ns> -o yaml
```

:::tip

Never set memory limits equal to requests for JVM or .NET applications. These runtimes need headroom above heap for GC, JIT, and thread stacks. A good starting point: `requests = typical usage`, `limits = requests * 2`.
:::

---

## CreateContainerConfigError

The container cannot start because a referenced resource is missing.

### Common causes

```bash
kubectl describe pod <pod> -n <ns> | grep -A 5 "Warning"
```

| Error | Fix |
|---|---|
| `secret "X" not found` | Create the secret in the correct namespace |
| `configmap "X" not found` | Create the configmap in the correct namespace |
| `key "Y" not found in secret "X"` | The secret exists but is missing the expected key. Check `kubectl get secret X -n <ns> -o jsonpath='{.data}'` |
| `projected volume mount failed` | Workload Identity token volume issue. Check OIDC issuer and service account annotations. |

---

## Stuck terminating

A pod is stuck in `Terminating` state and will not go away.

### Decision tree

**1. Check for finalizers:**
```bash
kubectl get pod <pod> -n <ns> -o jsonpath='{.metadata.finalizers}'
```

If finalizers are present, something is waiting to clean up. Removing them forcefully can cause resource leaks.

**2. Check for PDB blocking eviction:**
```bash
kubectl get pdb -n <ns>
```

If the PDB prevents disruption of the last remaining pod, the drain operation blocks.

**3. Force delete (last resort):**
```bash
kubectl delete pod <pod> -n <ns> --grace-period=0 --force
```

:::warning

Force-deleting a pod with a PersistentVolume attached can cause the volume to stay attached to the old node. The replacement pod cannot mount it. Use force delete only when you are sure there are no volume dependencies.
:::

---

## Quick diagnosis script

Run this when you need a fast overview of all issues in a namespace:

```bash
NS=my-namespace

echo "=== Non-running pods ==="
kubectl get pods -n $NS --field-selector=status.phase!=Running,status.phase!=Succeeded

echo "=== Warning events (last 1h) ==="
kubectl get events -n $NS --field-selector type=Warning --sort-by='.lastTimestamp' | tail -20

echo "=== Resource pressure ==="
kubectl top pods -n $NS --sort-by=memory | head -10

echo "=== PVC status ==="
kubectl get pvc -n $NS | grep -v Bound
```

## Resources

- [Debug Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/)
- [Debug Running Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)
- [Troubleshoot AKS Clusters](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/troubleshoot-aks-cluster-creation-issues)
