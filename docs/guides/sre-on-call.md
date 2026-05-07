---
sidebar_position: 1
title: "SRE on-call guide"
description: "Step-by-step playbook for handling AKS incidents: initial triage, common failure patterns, escalation paths, and post-incident review."
---

# SRE on-call guide

You got paged. Your AKS cluster has an issue. This is your step-by-step playbook for the first 30 minutes.

Do not start debugging randomly. Follow the sequence below. Most AKS incidents fall into a small number of patterns, and structured triage resolves them faster than intuition.

## First 5 minutes: assess scope

Before you touch anything, determine the blast radius. Run these commands in order:

```bash
# 1. Can you reach the API server?
kubectl cluster-info

# 2. Are nodes healthy?
kubectl get nodes -o wide

# 3. How many pods are unhealthy?
kubectl get pods --all-namespaces --field-selector status.phase!=Running,status.phase!=Succeeded

# 4. Are there recent events signaling trouble?
kubectl get events --all-namespaces --sort-by='.lastTimestamp' | tail -30

# 5. Check system pods — if these are broken, the cluster is broken
kubectl get pods -n kube-system
```

Use the output to classify the incident:

| Blast radius | Symptoms | Likely cause |
|---|---|---|
| Single pod | One pod in CrashLoopBackOff or Error | Application bug, bad config, missing secret |
| Single service | All pods of one deployment unhealthy | Bad rollout, resource exhaustion, image pull failure |
| Single node | Multiple pods on one node failing | Node not ready, disk pressure, OOM |
| Whole cluster | API server unreachable, all nodes affected | Control plane issue, networking failure, certificate expiry |

## Triage by symptom

### Users reporting errors

Work from the edge inward:

```bash
# 1. Check the failing pods
kubectl get pods -n <namespace> -l app=<service>
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace> --tail=100

# 2. Check the ingress controller
kubectl get pods -n ingress-nginx
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --tail=50

# 3. Check backend service endpoints
kubectl get endpoints <service-name> -n <namespace>
```

:::tip

If `kubectl get endpoints` returns an empty subset, the service selector does not match any running pods. Check label mismatches first — this is the most common cause of "service returns 503."

:::

### High latency

```bash
# 1. Check resource pressure on nodes
kubectl top nodes
kubectl top pods -n <namespace> --sort-by=cpu

# 2. Check for throttled pods
kubectl get pods -n <namespace> -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.qosClass}{"\n"}{end}'

# 3. Check node conditions
kubectl describe nodes | grep -A5 "Conditions:"

# 4. Check external dependencies (DNS resolution time, upstream APIs)
kubectl exec -it <pod-name> -n <namespace> -- nslookup <external-service>
```

:::warning

If `kubectl top nodes` shows CPU or memory above 80 percent on multiple nodes, the cluster autoscaler may be struggling to keep up. Check pending pods with `kubectl get pods --field-selector status.phase=Pending --all-namespaces` and review autoscaler status with `kubectl describe configmap cluster-autoscaler-status -n kube-system`.

:::

### Complete outage

```bash
# 1. Check API server — if this fails, use Azure portal
kubectl cluster-info

# 2. Check all nodes
kubectl get nodes

# 3. Check DNS (CoreDNS)
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50

# 4. Check networking (kube-proxy, CNI)
kubectl get pods -n kube-system -l component=kube-proxy
kubectl get pods -n kube-system | grep -i azure-cni
```

If `kubectl` itself is unreachable, go directly to the Azure portal. Check **Resource Health** under the AKS resource and look at **Activity Log** for recent control plane operations.

### Pods not scheduling

```bash
# 1. Check pending pods and their events
kubectl get pods --field-selector status.phase=Pending --all-namespaces
kubectl describe pod <pending-pod> -n <namespace>

# 2. Check cluster autoscaler
kubectl get events -n kube-system | grep -i "cluster-autoscaler"

# 3. Check resource quotas
kubectl get resourcequotas --all-namespaces

# 4. Check node capacity vs requests
kubectl describe nodes | grep -A10 "Allocated resources:"
```

Common reasons for scheduling failures:

| Event message | Cause | Fix |
|---|---|---|
| `Insufficient cpu` | Nodes are full, autoscaler at max | Increase `--max-count` on the node pool or reduce resource requests |
| `Insufficient memory` | Same as above for memory | Same as above |
| `node(s) had taint` | Pod missing toleration | Add toleration to pod spec or use the correct node pool |
| `no persistent volumes available` | PVC cannot bind | Check storage class exists and quota is not exhausted |
| `Too many pods` | Node at max pod limit | Default is 30 for Azure CNI — increase or add nodes |

## Common AKS incident patterns

### Node not ready

```bash
# Check node status
kubectl describe node <node-name> | grep -A20 "Conditions:"

# Check kubelet logs via Azure portal or node SSH
# Common causes: disk pressure, OOM killer, kubelet crash
```

**Disk pressure:** The node's OS disk is full. Usual culprits are container logs and unused images. Mitigation: enable ephemeral OS disks on the node pool to get a fresh disk on every reboot.

**OOM:** The kernel OOM killer terminated the kubelet or a system process. Check `dmesg` output on the node. Mitigation: set resource limits on all pods and use `Burstable` or `Guaranteed` QoS classes.

### Certificate expiry

AKS auto-rotates cluster certificates, but custom webhook certificates and ingress TLS certs are your responsibility.

```bash
# Check API server certificate expiry
kubectl get nodes -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].message}'

# Check webhook certificates
kubectl get validatingwebhookconfigurations -o yaml | grep -i "caBundle"
kubectl get mutatingwebhookconfigurations -o yaml | grep -i "caBundle"

# Rotate AKS cluster certificates if expired
az aks rotate-certs --resource-group <rg> --name <cluster>
```

:::warning

`az aks rotate-certs` causes a rolling restart of all nodes. Schedule this during a maintenance window. It takes 30 minutes or more for large clusters.

:::

### Quota exhaustion

```bash
# Check Azure subscription quotas
az vm list-usage --location <region> -o table

# Check Kubernetes resource quotas
kubectl get resourcequotas --all-namespaces

# Check PVC usage
kubectl get pvc --all-namespaces
```

### Failed upgrade

```bash
# Check upgrade status
az aks show --resource-group <rg> --name <cluster> --query "provisioningState"

# Check for stuck nodes
kubectl get nodes -o wide
kubectl get pods --all-namespaces | grep -v Running | grep -v Completed

# Check PodDisruptionBudgets blocking drain
kubectl get pdb --all-namespaces
```

A common cause of stuck upgrades is a PDB that does not allow any disruptions. If `minAvailable` equals the replica count, the node can never drain. Fix the PDB, then the upgrade proceeds.

### DNS resolution failures

```bash
# Test DNS from inside a pod
kubectl run dns-test --image=busybox:1.36 --rm -it --restart=Never -- nslookup kubernetes.default

# Check CoreDNS pods
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=100

# Check CoreDNS ConfigMap for custom entries
kubectl get configmap coredns-custom -n kube-system -o yaml
```

## Escalation matrix

| Severity | Criteria | Action | Azure support level |
|---|---|---|---|
| Sev A (Critical) | Production workload completely down, no workaround | Open Azure support ticket immediately, request call-back | Business Critical or Unified |
| Sev B (High) | Production degraded, workaround exists | Open ticket within 1 hour, include diagnostics | Standard or above |
| Sev C (Medium) | Non-production issue or intermittent problem | Open ticket during business hours | Standard |
| Sev D (Low) | Question or guidance request | Use Microsoft Q&A or open advisory ticket | Any |

**What to include in every support ticket:**

```text
- Subscription ID
- Resource group and cluster name
- Region
- Kubernetes version (kubectl version --short)
- Timestamp of when the issue started (UTC)
- Output of: kubectl get nodes -o wide
- Output of: kubectl get pods --all-namespaces --field-selector status.phase!=Running
- Output of: kubectl get events --sort-by='.lastTimestamp' --all-namespaces | tail -50
- Azure Activity Log entries for the cluster (last 2 hours)
- Correlation ID from any failed Azure operations
```

:::info

Run `az aks get-credentials` before generating diagnostics. For managed AAD clusters, use `az aks get-credentials --admin` if your regular token is expired — you need working `kubectl` access to collect the data above.

:::

## Post-incident checklist

Complete this within 48 hours of every Sev A or Sev B incident:

1. **Timeline** — Write a minute-by-minute account of what happened, when it was detected, and when it was resolved.
2. **Root cause** — Identify the actual root cause, not the proximate trigger.
3. **Detection gap** — How long between the issue starting and the first alert? If more than 5 minutes, fix monitoring.
4. **Resolution steps** — Document exactly what commands were run to resolve the issue.
5. **Prevention** — Identify at least one action item that prevents recurrence. Assign an owner and a due date.
6. **Runbook update** — If this incident type is not covered in the runbook, add it.

## Essential tools for on-call

### kubectl aliases

Add these to your shell profile:

```bash
alias k='kubectl'
alias kg='kubectl get'
alias kd='kubectl describe'
alias kl='kubectl logs'
alias kgp='kubectl get pods'
alias kgn='kubectl get nodes'
alias kge='kubectl get events --sort-by=".lastTimestamp"'
alias kns='kubectl config set-context --current --namespace'

# Quick health check
alias khealth='kubectl get nodes && echo "---" && kubectl get pods -A --field-selector status.phase!=Running,status.phase!=Succeeded'
```

### Azure portal resources

- **Resource Health** — Shows if the AKS control plane is healthy. Go to the AKS resource, select **Diagnose and solve problems**.
- **Container Insights live logs** — Real-time log streaming without `kubectl`. Go to the AKS resource, select **Monitoring > Logs > Live data**.
- **Activity Log** — Shows recent control plane operations (scale, upgrade, restart). Filter to the last 2 hours.

### CLI diagnostics

```bash
# Collect AKS diagnostics bundle
az aks kollect --resource-group <rg> --name <cluster> --storage-account <sa>

# Check AKS managed control plane health
az aks show --resource-group <rg> --name <cluster> --query "powerState"
```

## Runbook template

Copy this template and customize it for your team. Store it in your team's wiki or incident management system.

```markdown
# Runbook: [Incident type]

## Symptoms
- [What does the alert look like?]
- [What do users report?]

## Triage steps
1. [First command to run]
2. [Second command to run]
3. [How to confirm this is the right runbook]

## Resolution
1. [Step-by-step fix]
2. [Verification that the fix worked]

## Escalation
- If step N fails, escalate to [team/person]
- Azure support severity: [A/B/C]

## Prevention
- [What monitoring should catch this earlier]
- [What config change prevents recurrence]
```

## Resources

- [AKS troubleshooting overview](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/welcome-azure-kubernetes)
- [AKS diagnostics overview](https://learn.microsoft.com/en-us/azure/aks/concepts-diagnostics)
- [Cluster autoscaler troubleshooting](https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler-overview)
- [CoreDNS customization in AKS](https://learn.microsoft.com/en-us/azure/aks/coredns-custom)
- [AKS certificate rotation](https://learn.microsoft.com/en-us/azure/aks/certificate-rotation)
- [Azure support plans](https://azure.microsoft.com/en-us/support/plans)
