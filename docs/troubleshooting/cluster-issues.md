---
sidebar_position: 4
title: "Cluster troubleshooting"
description: "Decision trees for cluster-level AKS issues: node NotReady, upgrade failures, API server unreachable, certificate expiry, and quota exhaustion."
---

# Cluster troubleshooting

Pod troubleshooting covers workload failures. This page covers cluster-level failures: when nodes, the control plane, or infrastructure itself is the problem.

## Start here

Run this before anything else. It tells you whether the problem is nodes, control plane, or resource exhaustion in under 30 seconds.

```bash
# Node status — any NotReady nodes?
kubectl get nodes -o wide

# kube-system health — every pod must be Running
kubectl get pods -n kube-system -o wide

# Cluster-level events — sorted by time, most recent last
kubectl get events --sort-by='.lastTimestamp' -A | tail -30

# AKS cluster state from Azure
az aks show -g <rg> -n <cluster> --query "{state:provisioningState,power:powerState.code,k8s:kubernetesVersion}" -o table
```

---

## Node NotReady

A node shows `NotReady` in `kubectl get nodes`. Pods on that node stop receiving traffic and eventually get evicted.

### Decision tree

**1. Identify the NotReady node and how long it has been down:**

```bash
kubectl get nodes -o wide
kubectl describe node <node-name> | grep -A 10 "Conditions:"
```

**2. What do the conditions say?**

| Condition | Meaning | Fix |
|---|---|---|
| `MemoryPressure=True` | Node is running out of memory | Evict large pods, add nodes, or increase VM size |
| `DiskPressure=True` | Disk usage over 85% — kubelet starts evicting pods | Clean up images with `crictl rmi --prune`, increase OS disk size |
| `PIDPressure=True` | Too many processes | Find the pod forking excessively: `kubectl top pods --sort-by=cpu` |
| `Ready=False`, `KubeletNotReady` | Kubelet crashed or cannot reach the API server | SSH into the node and check kubelet logs |

**3. Check kubelet status on the node:**

```bash
# Use node-shell or kubectl debug to access the node
kubectl debug node/<node-name> -it --image=mcr.microsoft.com/cbl-mariner/busybox:2.0
# Inside the debug pod:
chroot /host
systemctl status kubelet
journalctl -u kubelet --no-pager --since "30 minutes ago"
```

**4. Check VM health in Azure:**

```bash
az vm get-instance-view \
  --ids $(az vmss list-instances -g MC_<rg>_<cluster>_<region> --vmss-name <vmss-name> --query "[].id" -o tsv) \
  --query "[].{name:name,status:instanceView.statuses[1].displayStatus}" -o table
```

**5. If the node is unrecoverable, reimage it:**

```bash
# For VMSS-backed node pools (default)
az vmss reimage --resource-group MC_<rg>_<cluster>_<region> --name <vmss-name> --instance-ids <instance-id>
```

:::warning

Do not reimage multiple nodes simultaneously. Reimage one node at a time and wait for it to rejoin the cluster as `Ready` before moving to the next.

:::

### Prevention

Use the cluster autoscaler with `--min-count` set to at least 3 for production pools. Enable node auto-repair — it automatically reimages nodes stuck in `NotReady` for more than 10 minutes:

```bash
az aks update -g <rg> -n <cluster> --enable-node-auto-repair
```

---

## Upgrade failures

Cluster or node pool upgrades get stuck, leave nodes in a mixed-version state, or fail outright.

### Decision tree

**1. Check current upgrade status:**

```bash
az aks show -g <rg> -n <cluster> --query "{state:provisioningState,k8s:kubernetesVersion}" -o table
az aks nodepool list -g <rg> --cluster-name <cluster> --query "[].{name:name,version:orchestratorVersion,state:provisioningState,count:count}" -o table
```

**2. What does the provisioning state say?**

| State | Meaning | Action |
|---|---|---|
| `Upgrading` | Upgrade is in progress | Wait. Check node drain events for progress |
| `Failed` | Upgrade failed mid-way | Check the error message, fix the cause, then retry |
| `Canceled` | Upgrade was manually stopped | Decide whether to retry or roll forward |

**3. If PDB is blocking node drain:**

This is the single most common upgrade failure. A PodDisruptionBudget prevents the node from draining, and the upgrade hangs.

```bash
# Find PDBs that are blocking
kubectl get pdb -A
kubectl describe pdb <pdb-name> -n <namespace>
```

:::tip

Set `maxUnavailable: 1` instead of `minAvailable: 100%` on PDBs. A PDB with `minAvailable` equal to the replica count blocks all voluntary disruptions including upgrades.

:::

**4. Abort a stuck upgrade:**

```bash
# Stop the upgrade — nodes already upgraded stay at the new version
az aks upgrade -g <rg> -n <cluster> --kubernetes-version <current-version> --no-wait
```

**5. Retry after fixing the blocker:**

```bash
az aks upgrade -g <rg> -n <cluster> --kubernetes-version <target-version>
```

### Prevention

Always run `az aks get-upgrades` before upgrading. Skip no more than one minor version. Test upgrades on a dev cluster first — not because the docs say to, but because PDB and webhook issues only surface during real drains.

---

## API server unreachable

`kubectl` commands time out or return connection errors. You cannot manage the cluster at all.

### Decision tree

**1. Confirm the problem is the API server, not your machine:**

```bash
# Check if you can reach the API server endpoint
kubectl cluster-info
# Check your kubeconfig context
kubectl config current-context
# Re-fetch credentials
az aks get-credentials -g <rg> -n <cluster> --overwrite-existing
```

**2. Narrow down the cause:**

| Symptom | Likely cause | Fix |
|---|---|---|
| `Unable to connect to the server: dial tcp ... i/o timeout` | Authorized IP ranges blocking your IP | Add your current IP to authorized ranges |
| `Unable to connect to the server: EOF` | Private cluster and you are outside the VNet | Connect via VPN, jump box, or `az aks command invoke` |
| `error: You must be logged in to the server (Unauthorized)` | Token expired or kubelogin not configured | Re-run `az login` then `az aks get-credentials` |
| `Unable to connect to the server: x509: certificate has expired` | Client certificate expired | Rotate cluster certificates (see certificate expiry below) |

**3. For authorized IP range issues:**

```bash
# Check current authorized ranges
az aks show -g <rg> -n <cluster> --query "apiServerAccessProfile.authorizedIpRanges"

# Add your current IP
MY_IP=$(curl -s ifconfig.me)/32
az aks update -g <rg> -n <cluster> --api-server-authorized-ip-ranges "$MY_IP"
```

**4. For private clusters — use command invoke as an escape hatch:**

```bash
az aks command invoke -g <rg> -n <cluster> --command "kubectl get nodes"
```

:::info

Use `az aks command invoke` for emergencies only. It is slow and has a 60-second timeout. For regular access to private clusters, set up a VPN or an Azure Bastion jump box inside the VNet.

:::

**5. For kubelogin issues:**

```bash
# Confirm kubelogin is installed
kubelogin --version

# Convert kubeconfig to use device code login
kubelogin convert-kubeconfig -l devicecode
```

---

## Certificate expiry

AKS auto-rotates cluster certificates, but rotation can fail silently. When certificates expire, nodes drop out and API calls fail with x509 errors.

### Diagnostics

**1. Check certificate expiration dates:**

```bash
az aks show -g <rg> -n <cluster> --query "{certExpiry:azurePortalFqdn}" -o table

# More detailed — check the actual cert on the API server
kubectl get nodes -o wide 2>&1 | grep -i "certificate"
```

**2. Check if auto-rotation is working:**

```bash
az aks show -g <rg> -n <cluster> --query "autoUpgradeProfile"
```

### Fix

**Force certificate rotation:**

```bash
az aks rotate-certs -g <rg> -n <cluster>
```

:::warning

`az aks rotate-certs` causes downtime. It restarts every node in the cluster to pick up new certificates. Schedule this during a maintenance window. The operation takes 20-30 minutes for a typical cluster.

:::

### Prevention

Enable the auto-upgrade channel. Clusters on `patch` or `stable` auto-upgrade channels get certificates rotated automatically as part of the upgrade cycle.

---

## Quota exhaustion

You cannot create new nodes, attach disks, or get pod IPs. Azure returns quota errors that surface as vague Kubernetes failures.

### Decision tree

**1. Identify the quota that is exhausted:**

```bash
# Check vCPU quota for the region
az vm list-usage --location <region> -o table | grep -i "cores"

# Check network quota
az network list-usages --location <region> -o table

# Check disk quota
az disk list -g MC_<rg>_<cluster>_<region> --query "length(@)"
```

**2. Common quota failures and what they look like in Kubernetes:**

| Kubernetes symptom | Azure quota hit | How to confirm |
|---|---|---|
| Nodes stuck in `Provisioning` | Regional vCPU limit | `az vm list-usage --location <region>` |
| Pods stuck in `Pending` with "no available addresses" | Subnet IP exhaustion | `az network vnet subnet show` — check available IPs |
| PVC stuck in `Pending` | Managed disk limit per subscription | `az disk list --query "length(@)"` |
| Autoscaler not adding nodes | VM family quota exceeded | Check the specific VM SKU quota |

**3. Request a quota increase:**

```bash
# Use the Azure CLI to request an increase
az quota create \
  --resource-name "standardDSv3Family" \
  --scope "/subscriptions/<sub-id>/providers/Microsoft.Compute/locations/<region>" \
  --limit-object value=<new-limit> limit-object-type=LimitValue \
  --resource-type "dedicated"
```

:::tip

Do not wait until you hit the limit. Set Azure Monitor alerts at 80% quota usage. Quota increases are free and usually approved within hours, but some VM families take days.

:::

### Pod CIDR exhaustion

If you use Azure CNI (not overlay), every pod gets a real subnet IP. A `/24` subnet gives you 251 usable IPs — that is roughly 8 nodes with 30 pods each.

**Check available IPs:**

```bash
az network vnet subnet show \
  -g <rg> --vnet-name <vnet> -n <subnet> \
  --query "{addressPrefix:addressPrefix,availableIps:ipConfigurations.length(@)}" -o table
```

Use Azure CNI Overlay for new clusters. It decouples pod IPs from subnet IPs, giving each node a /24 from a private range. You will never run out of pod IPs.

---

## Control plane errors

kube-system pods are unhealthy, CoreDNS is failing, or admission webhooks are blocking deployments.

### CoreDNS failures

**Symptoms:** Pods cannot resolve DNS names. Services return `NXDOMAIN` or time out on DNS lookups.

```bash
# Check CoreDNS pods
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50

# Test DNS resolution from inside the cluster
kubectl run dns-test --image=mcr.microsoft.com/cbl-mariner/busybox:2.0 --rm -it --restart=Never -- nslookup kubernetes.default
```

| Log message | Cause | Fix |
|---|---|---|
| `SERVFAIL` | Upstream DNS unreachable | Check VNet DNS settings and NSG rules |
| `i/o timeout` | CoreDNS pod cannot reach API server | Check node connectivity and kube-proxy |
| `REFUSED` | Custom DNS server rejecting queries | Fix the upstream DNS server configuration |

### Webhook failures blocking deployments

**Symptoms:** `kubectl apply` returns `Internal error occurred: failed calling webhook`. Deployments, pods, or namespaces cannot be created.

```bash
# List all webhooks
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations

# Check if the webhook service is running
kubectl get endpoints -n <webhook-namespace> <webhook-service>
```

:::warning

A webhook with `failurePolicy: Fail` and a dead backing service blocks all matching API calls. If you are locked out, patch the webhook to `Ignore` or delete it:

```bash
kubectl delete validatingwebhookconfiguration <name>
```

:::

### kube-system pod crashes

If any kube-system pod is in `CrashLoopBackOff`, the cluster is degraded. Check logs immediately:

```bash
kubectl get pods -n kube-system | grep -v Running
kubectl logs -n kube-system <pod-name> --previous
kubectl describe pod -n kube-system <pod-name>
```

Do not delete kube-system pods unless you know exactly what you are doing. Most are managed by AKS and will be recreated, but some (like `konnectivity-agent`) require the control plane to be healthy first.

---

## etcd latency and API server slowness

The cluster is running but `kubectl` commands are slow, watches are delayed, and controllers lag behind reality.

### Symptoms

- `kubectl get pods` takes more than 5 seconds
- Deployments take minutes to roll out
- HPA reacts slowly to metric changes
- API server audit logs show high latency on LIST calls

### Diagnostics

```bash
# Check API server metrics (if metrics endpoint is exposed)
kubectl get --raw /metrics | grep apiserver_request_duration_seconds

# Count objects — too many objects in a namespace is a red flag
kubectl get all -A --no-headers | wc -l

# Check for expensive LIST calls (requires audit logging)
# Look for calls without fieldSelector or labelSelector
kubectl get events -A --no-headers | wc -l
```

### Common causes and fixes

| Cause | How to confirm | Fix |
|---|---|---|
| Too many Events objects | `kubectl get events -A --no-headers \| wc -l` returns 10,000+ | Set event TTL with `--event-ttl` or clean up stale events |
| CRDs with thousands of instances | `kubectl get <crd> -A --no-headers \| wc -l` | Paginate list calls, add indexes, or archive old CRs |
| Controllers doing unfiltered LIST calls | API server audit logs | Fix the controller code to use field selectors and label selectors |
| Large Secrets or ConfigMaps | `kubectl get secrets -A -o json \| jq '.items[].data \| length'` | Split large secrets, use external secret stores |
| Too many watches | API server memory usage climbing | Reduce watch cardinality in custom controllers |

:::tip

Use `--field-selector` and `--label-selector` on every LIST call in custom controllers. An unfiltered `LIST pods` on a cluster with 10,000 pods pulls the entire pod list from etcd into the API server memory on every call.

:::

### Prevention

Set resource quotas per namespace to prevent any single team from creating unbounded objects:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: object-limits
  namespace: team-a
spec:
  hard:
    configmaps: "100"
    secrets: "100"
    services: "20"
    pods: "200"
```

---

## Quick cluster health check

Run this script to get a comprehensive cluster health snapshot. Save it as `cluster-health.sh` and run it before opening a support ticket.

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Cluster info ==="
kubectl cluster-info

echo -e "\n=== Node status ==="
kubectl get nodes -o wide

echo -e "\n=== Node conditions (NotReady or pressure) ==="
kubectl get nodes -o json | jq -r '
  .items[] |
  select(.status.conditions[] |
    select(.type != "Ready" and .status == "True") or
    select(.type == "Ready" and .status != "True")
  ) |
  .metadata.name + ": " +
  ([.status.conditions[] | select(.status == "True" or (.type == "Ready" and .status != "True")) | .type + "=" + .status] | join(", "))'

echo -e "\n=== kube-system pods not Running ==="
kubectl get pods -n kube-system --field-selector=status.phase!=Running 2>/dev/null || echo "All kube-system pods are Running"

echo -e "\n=== Cluster events (warnings only, last 30 min) ==="
kubectl get events -A --field-selector=type=Warning --sort-by='.lastTimestamp' | tail -20

echo -e "\n=== Resource usage ==="
kubectl top nodes 2>/dev/null || echo "Metrics server not available"

echo -e "\n=== PDBs that may block upgrades ==="
kubectl get pdb -A -o json | jq -r '
  .items[] |
  select(.status.disruptionsAllowed == 0) |
  .metadata.namespace + "/" + .metadata.name + " — disruptionsAllowed: 0"'

echo -e "\n=== Pending PVCs ==="
kubectl get pvc -A --field-selector=status.phase=Pending 2>/dev/null || echo "No pending PVCs"

echo -e "\n=== AKS cluster state ==="
az aks show -g "${1:-myRG}" -n "${2:-myCluster}" \
  --query "{state:provisioningState,power:powerState.code,k8s:kubernetesVersion,nodeRG:nodeResourceGroup}" -o table 2>/dev/null || echo "Provide resource group and cluster name as arguments"
```

---

## When to contact Azure support

Not every problem requires a support ticket. Use this severity matrix to decide.

### Severity matrix

| Severity | When to use | Example | Expected response |
|---|---|---|---|
| A / Critical | Production down, no workaround | All nodes NotReady, API server unreachable | 1 hour (with Premier/Unified) |
| B / High | Production impaired, workaround exists | Upgrades failing, one node pool down | 4 hours |
| C / Standard | Non-critical issue | Quota increase needed, minor degradation | 8 business hours |

### What to collect before opening a ticket

Azure Support will ask for all of this. Collect it upfront to avoid back-and-forth:

```bash
# 1. Cluster resource ID
az aks show -g <rg> -n <cluster> --query id -o tsv

# 2. Cluster state and version
az aks show -g <rg> -n <cluster> --query "{state:provisioningState,version:kubernetesVersion}" -o json

# 3. Node pool details
az aks nodepool list -g <rg> --cluster-name <cluster> -o table

# 4. Recent cluster operations
az aks operation-abort list -g <rg> -n <cluster> 2>/dev/null
az monitor activity-log list --resource-group <rg> --offset 1h --query "[?status.value=='Failed']" -o table

# 5. Kubernetes events and pod status
kubectl get events -A --sort-by='.lastTimestamp' > cluster-events.txt
kubectl get pods -A -o wide > all-pods.txt
kubectl describe nodes > node-details.txt
```

:::info

Always include the **correlation ID** from failed Azure CLI commands. It is printed in the error output and lets support trace the exact API call that failed on their backend.

:::

---

## Resources

- [Troubleshoot common AKS issues](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/welcome-azure-kubernetes)
- [AKS node NotReady troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/availability-performance/node-not-ready-basic-troubleshooting)
- [Certificate rotation in AKS](https://learn.microsoft.com/en-us/azure/aks/certificate-rotation)
- [AKS upgrade best practices](https://learn.microsoft.com/en-us/azure/aks/upgrade-aks-cluster)
- [Quota limits for Azure subscriptions](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits)
- [Troubleshoot API server and etcd problems](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/availability-performance/troubleshoot-apiserver-etcd)
- [AKS diagnostics overview](https://learn.microsoft.com/en-us/azure/aks/aks-diagnostics)
- [CoreDNS troubleshooting in AKS](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/connectivity/troubleshoot-dns-failure-from-pod-but-not-from-node)
