---
sidebar_position: 4
title: "Virtual Nodes (ACI Integration)"
description: "Burst to Azure Container Instances for sudden spikes. Serverless pods with no node management."
---

# Virtual Nodes (ACI Integration)

Virtual Nodes are niche. Use them for batch jobs and burst scenarios ONLY. Do not use them for steady-state workloads. For most teams, KEDA plus Cluster Autoscaler is a better scaling story.

## How Virtual Nodes Work

Virtual Nodes use the Virtual Kubelet to present Azure Container Instances (ACI) as a node in your cluster. When pods are scheduled on the virtual node, they run as serverless containers on ACI instead of on VMs.

```
Pod scheduled to virtual node
    -> Virtual Kubelet intercepts
    -> Creates ACI container group
    -> Pod runs serverless (no VM to manage)
    -> Pay per second of execution
```

:::info
Virtual Nodes provision pods in seconds (not minutes like real nodes). This makes them useful for absorbing sudden spikes that cannot wait for Cluster Autoscaler to provision VMs.
:::

## Enabling Virtual Nodes

```bash
# Requires a subnet delegated to ACI
az aks enable-addons \
  --resource-group myRG \
  --name myAKS \
  --addons virtual-node \
  --subnet-name aci-subnet
```

## When to Use Virtual Nodes

| Scenario | Good Fit? | Why |
|----------|-----------|-----|
| CI/CD burst builds | Yes | Short-lived, no state, elastic demand |
| Event-driven batch processing | Yes | Burst to hundreds of pods, pay only for execution |
| Absorbing traffic spikes | Maybe | Fast provisioning, but limited networking |
| Steady-state API serving | No | ACI per-second cost exceeds VM cost at scale |
| Workloads needing DaemonSets | No | Virtual Nodes do not support DaemonSets |
| Stateful workloads | No | No persistent volume support |

:::tip
The sweet spot for Virtual Nodes: workloads that are short-lived, stateless, embarrassingly parallel, and arrive in unpredictable bursts. Think image processing pipelines, report generation, or load testing.
:::

## Example: Burst Job to Virtual Node

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: report-generator
spec:
  parallelism: 50
  completions: 200
  template:
    spec:
      nodeSelector:
        kubernetes.io/role: agent
        type: virtual-kubelet
      tolerations:
      - key: virtual-kubelet.io/provider
        operator: Exists
      - key: azure.com/aci
        effect: NoSchedule
      containers:
      - name: worker
        image: myregistry.azurecr.io/report-worker:latest
        resources:
          requests:
            cpu: "1"
            memory: "2Gi"
          limits:
            cpu: "2"
            memory: "4Gi"
      restartPolicy: Never
  backoffLimit: 3
```

This schedules 50 parallel pods on ACI. They spin up in seconds, process reports, and terminate. You pay only for execution time.

## Hard Limitations

Do not ignore these. They are not edge cases; they will bite you in production:

| Limitation | Impact |
|-----------|--------|
| Linux containers only | No Windows workloads on Virtual Nodes |
| No persistent volumes | Cannot mount Azure Disks or Azure Files PVCs |
| No DaemonSets | Monitoring agents, log collectors will not run on ACI pods |
| Limited networking | ACI pods get IPs from the delegated subnet, not the pod CIDR |
| No host networking | Cannot use hostPort or hostNetwork |
| No privileged containers | Security contexts with elevated privileges are rejected |
| Init container limits | Limited init container support |
| No GPU sharing | GPU containers supported but no fractional GPU |

:::warning
Virtual Nodes cannot run your standard monitoring stack (Prometheus node exporter, Fluent Bit DaemonSet). ACI pods need separate observability configuration. Use Azure Monitor container insights for ACI workloads.
:::

## Cost Comparison

Virtual Nodes charge per-second of vCPU and memory:

- ACI: ~$0.000012/second per vCPU, ~$0.0000013/second per GB memory
- A pod using 1 vCPU + 2 GB for 1 hour costs ~$0.05
- An equivalent D2s_v5 VM (2 vCPU, 8 GB) costs ~$0.096/hour

**Rule of thumb**: If a workload runs more than 50% of the time, run it on real nodes. Virtual Nodes are cost-effective only for intermittent burst workloads.

## Virtual Nodes vs Alternatives

| Approach | Speed | Cost Model | Best For |
|----------|-------|-----------|----------|
| Cluster Autoscaler | 2-4 min (new node) | VM hourly rate | Sustained scaling |
| Virtual Nodes | 5-15 seconds | Per-second ACI | Short bursts |
| KEDA + CA | 2-4 min (cold) | VM rate + scale to zero | Event-driven |
| Spot node pools | 2-4 min | 60-90% discount VMs | Fault-tolerant batch |

## Common Mistakes

**Using Virtual Nodes as your primary compute.** ACI is not a replacement for VMs at scale. The per-second cost adds up fast for always-running workloads. Use real nodes for baseline, Virtual Nodes for spikes only.

**Ignoring the subnet size.** Each ACI pod gets an IP from your delegated subnet. A /24 gives you 251 IPs. If you burst 300 pods, some will fail to schedule. Size your ACI subnet for your maximum burst.

**Expecting full Kubernetes feature parity.** Service mesh, network policies, volume mounts, init containers -- many features work differently or not at all on ACI. Test thoroughly before depending on Virtual Nodes in production.

**Not setting resource limits.** ACI charges for allocated resources, not just what you use. Set accurate resource requests and limits to avoid paying for capacity your pods never touch.

## Resources

- [Virtual Nodes on AKS](https://learn.microsoft.com/en-us/azure/aks/virtual-nodes)
- [ACI Pricing](https://azure.microsoft.com/en-us/pricing/details/container-instances/)
- [Virtual Kubelet](https://learn.microsoft.com/en-us/azure/aks/virtual-nodes-cli)
