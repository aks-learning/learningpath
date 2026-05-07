---
sidebar_position: 1
title: What is Kubernetes?
description: Introduction to Kubernetes concepts for AKS learners
---

# What is Kubernetes?

<span className="badge--beginner">🟢 Beginner</span>

Kubernetes (K8s) is an open-source container orchestration platform that automates the deployment, scaling, and management of containerized applications.

## Why Kubernetes?

- **Self-healing**: Automatically restarts failed containers
- **Horizontal scaling**: Scale up/down based on demand
- **Service discovery & load balancing**: Built-in DNS and traffic distribution
- **Automated rollouts & rollbacks**: Deploy with confidence
- **Secret & configuration management**: Secure and flexible

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Pod** | Smallest deployable unit (one or more containers) |
| **Deployment** | Manages replica sets and rolling updates |
| **Service** | Stable networking endpoint for pods |
| **Namespace** | Logical isolation within a cluster |
| **ConfigMap/Secret** | Configuration and sensitive data management |
| **PersistentVolume** | Durable storage for stateful workloads |

## Resources

- 📄 [What is Kubernetes? (Azure)](https://azure.microsoft.com/en-us/resources/cloud-computing-dictionary/what-is-kubernetes/)
- 📄 [Kubernetes Concepts (Official)](https://kubernetes.io/docs/concepts/)
- 📄 [Kubernetes Components](https://kubernetes.io/docs/concepts/overview/components/)

## Deep Dive

- [Namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Pods](https://kubernetes.io/docs/concepts/workloads/pods/)
- [Services](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

---

**Next**: [What is AKS?](./what-is-aks) →
