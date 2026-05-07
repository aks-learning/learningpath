---
sidebar_position: 1
title: Networking Concepts
description: Overview of AKS networking fundamentals
---

# Networking Concepts

<span className="badge--intermediate">🟡 Intermediate</span>

Networking is one of the most critical aspects of AKS cluster design.

## How AKS Networking Works

In AKS, every pod gets its own IP address. How those IPs are assigned depends on your CNI (Container Network Interface) choice.

## Key Networking Components

| Component | Purpose |
|-----------|---------|
| **CNI Plugin** | Assigns IPs to pods, manages network connectivity |
| **Services** | Expose pods via ClusterIP, NodePort, or LoadBalancer |
| **Ingress** | HTTP/HTTPS routing (Layer 7) |
| **Network Policies** | Pod-to-pod firewall rules |
| **DNS (CoreDNS)** | In-cluster name resolution |
| **Service Mesh** | Advanced traffic management, mTLS |

## Resources

- 📄 [Networking Concepts for AKS](https://learn.microsoft.com/en-us/azure/aks/concepts-network)
- 📄 [Azure CNI Networking](https://learn.microsoft.com/en-us/azure/aks/configure-azure-cni)
- 📄 [Network Policies](https://learn.microsoft.com/en-us/azure/aks/use-network-policies)

## 🧪 Hands-on Lab

> **[Advanced Container Networking Services](https://azure-samples.github.io/aks-labs/docs/networking/acns-lab)**
> Explore ACNS capabilities for enhanced AKS networking.
> ⏱️ ~60 minutes | 🟡 Intermediate

---

**Next**: [CNI Comparison](./cni-comparison) →
