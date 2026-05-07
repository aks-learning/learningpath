---
sidebar_position: 1
title: "What is Kubernetes?"
description: "When you actually need Kubernetes, when you don't, and why managed K8s is the only sane choice for most teams."
---

# What is Kubernetes?

Kubernetes (K8s) is a container orchestration platform. It takes your containerized applications and runs them across a cluster of machines with self-healing, scaling, rolling deployments, and service discovery built in.

But here is the real question: **do you actually need it?**

## You need Kubernetes when...

- You have **5+ microservices** that need to communicate, scale independently, and deploy on different cadences
- You need **rolling deployments with zero downtime** as a hard requirement
- Your traffic is **bursty or unpredictable** and you need horizontal autoscaling that reacts in seconds, not minutes
- You have **multi-team ownership** of services and need namespace isolation, RBAC, and resource quotas
- You are running **stateful workloads** (databases, queues, ML training) alongside stateless ones in the same infrastructure
- You need **portable infrastructure** across clouds or hybrid environments

## You do NOT need Kubernetes when...

:::warning Stop. Think before you adopt Kubernetes.

The number one mistake beginners make is adopting Kubernetes for a 2-service application that could run perfectly well on Azure Container Apps or even App Service. Kubernetes adds operational complexity. If you don't need what it gives you, it will only slow you down.
:::

- You have **1-3 services** with predictable traffic -- use Azure Container Apps instead
- You are building a **monolith** or a simple API -- use App Service
- You want **zero infrastructure management** -- use Azure Container Apps with scale-to-zero
- Your team has **no container experience** and no time to learn -- start with Container Apps, graduate to AKS later
- You need **event-driven serverless** with sub-second cold starts -- use Azure Functions

## The path: containers to orchestration

Here is how the progression works in the real world:

1. **You containerize your app** -- Docker gives you reproducible builds and consistent environments
2. **You need to run multiple containers** -- Docker Compose works on a single machine, but production needs resilience
3. **You need orchestration** -- Something must decide which machine runs which container, restart failures, route traffic, and manage secrets
4. **You pick an orchestrator** -- Kubernetes won the orchestration war. Everything else (Docker Swarm, Mesos, Nomad) is niche or dead

```yaml
# This is a Kubernetes Deployment. It tells K8s:
# "Run 3 copies of my app, restart them if they crash,
#  and roll out new versions with zero downtime."
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-api
  template:
    metadata:
      labels:
        app: my-api
    spec:
      containers:
      - name: my-api
        image: myregistry.azurecr.io/my-api:v1.2.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "250m"
            memory: "256Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
```

## Core concepts you must know

| Concept | What It Does | Why It Matters |
|---------|-------------|----------------|
| **Pod** | Smallest unit. One or more containers sharing network/storage. | You almost never create Pods directly. Use Deployments. |
| **Deployment** | Manages replicas and rolling updates. | This is your bread and butter. Every stateless service is a Deployment. |
| **Service** | Stable internal DNS name and load balancer for Pods. | Pods are ephemeral. Services give them a permanent address. |
| **Ingress** | External HTTP/HTTPS routing into your cluster. | Without this, nothing outside the cluster can reach your apps. |
| **Namespace** | Logical isolation boundary. | Use one per team or per environment (dev/staging/prod). |
| **ConfigMap** | Non-secret configuration data. | Decouple config from container images. Change config without redeploying. |
| **Secret** | Sensitive data (passwords, keys, certs). | Never bake secrets into images. Always use Secrets or external vaults. |
| **PersistentVolumeClaim** | Request for durable storage. | Required for databases, file storage, anything that survives Pod restarts. |
| **HorizontalPodAutoscaler** | Scales Pod replicas based on metrics. | Without this, you are either overprovisioned or about to crash. |

## Why managed Kubernetes (not self-managed)

:::tip Strong recommendation

Do not run self-managed Kubernetes unless you have a dedicated platform team of 3+ engineers. Self-managed K8s means you own: etcd backup/restore, control plane upgrades, certificate rotation, API server availability, and every CVE patch. That is a full-time job for multiple people.
:::

**Use a managed service like AKS.** Here is why:

| Concern | Self-Managed | AKS (Managed) |
|---------|-------------|----------------|
| Control plane availability | Your problem (etcd quorum, API server HA) | Microsoft's SLA (99.95% with Standard tier) |
| Kubernetes upgrades | Manual, risky, multi-hour process | One command or fully automated channels |
| Security patching | You track CVEs and patch yourself | Node image auto-upgrades available |
| Certificate management | You rotate certs before expiry | Handled automatically |
| Cost of control plane | You pay for those VMs | Free. You pay zero for the control plane. |
| Networking | You wire up CNI, load balancers, DNS | Azure-native integration out of the box |

The only legitimate reasons to self-manage:

- Air-gapped environments with no cloud connectivity
- Exotic hardware (edge, bare metal, specialized GPUs not available in cloud)
- Regulatory requirements that literally prohibit managed services (rare)

## Kubernetes vs. alternatives decision table

| Scenario | Recommendation | Why |
|----------|---------------|-----|
| 1-3 stateless services, predictable traffic | **Azure Container Apps** | Simpler, cheaper, scale-to-zero, no K8s knowledge needed |
| 5+ services, multiple teams, complex networking | **AKS** | You need the orchestration power |
| Event-driven, sporadic workloads | **Azure Functions** | Purpose-built for this, sub-second scaling |
| Monolith or simple web app | **App Service** | Managed platform, no containers needed |
| ML training pipelines | **AKS with GPU node pools** | K8s GPU scheduling is mature and well-supported |
| Hybrid/multi-cloud mandate | **AKS + Azure Arc** | Consistent K8s across environments |

## The learning curve: what to focus on first

Kubernetes has a massive API surface. Do not try to learn everything at once. Here is the order that matters:

1. **Week 1**: Pods, Deployments, Services. Get an app running and reachable.
2. **Week 2**: ConfigMaps, Secrets, resource requests/limits. Make your app configurable and stable.
3. **Week 3**: Namespaces, RBAC, Ingress. Isolate workloads and expose them properly.
4. **Week 4**: HPA, PersistentVolumeClaims, health probes. Make your app resilient and scalable.
5. **After that**: StatefulSets, DaemonSets, CRDs, Operators, service mesh -- only when you need them.

:::warning What NOT to learn early

Do not start with Helm charts, Operators, or service meshes. These are advanced patterns that solve problems you do not have yet. Learn the primitives first. If you cannot deploy an app with raw YAML, you should not be abstracting it with Helm.
:::

## Common beginner mistakes

| Mistake | Consequence | Fix |
|---------|------------|-----|
| No resource requests/limits | Pods get scheduled anywhere, OOMKilled randomly | Always set `requests`. Set `limits` for memory. |
| No liveness/readiness probes | K8s cannot tell if your app is healthy, sends traffic to broken Pods | Add probes from day one. Even a simple TCP check. |
| Using `latest` image tag | You have no idea what version is running, rollbacks are impossible | Always use specific version tags (`:v1.2.3`). |
| Storing state in local disk | Pod restarts lose all data | Use PersistentVolumeClaims for any data that must survive restarts. |
| One giant namespace | No isolation, RBAC is all-or-nothing, resource quotas impossible | One namespace per team or per service boundary. |
| Ignoring Pod disruption budgets | Cluster upgrades take down all replicas simultaneously | Set PDBs so at least N-1 replicas stay running during maintenance. |

## Resources

- [What is Kubernetes? (Azure)](https://azure.microsoft.com/en-us/resources/cloud-computing-dictionary/what-is-kubernetes/)
- [Kubernetes Concepts (Official Docs)](https://kubernetes.io/docs/concepts/)
- [Kubernetes Components Architecture](https://kubernetes.io/docs/concepts/overview/components/)
- [Azure Container Apps vs AKS](https://learn.microsoft.com/en-us/azure/container-apps/compare-options)
- [Kubernetes the Hard Way (learn what managed saves you from)](https://github.com/kelseyhightower/kubernetes-the-hard-way)
- [AKS Labs -- Hands-on Learning](https://azure-samples.github.io/aks-labs/)

---

**Next**: [What is AKS?](./what-is-aks) -- where we go deep on Azure's managed Kubernetes offering.
