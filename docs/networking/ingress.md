---
sidebar_position: 3
title: "Ingress & Load Balancing"
description: "Configure ingress controllers and load balancing for AKS workloads including NGINX Ingress, Application Gateway for Containers, and load balancer services."
---

# Ingress & Load Balancing

<span className="badge--intermediate">📚 Intermediate</span>

Learn how to expose applications running on AKS to external traffic using ingress controllers and load balancing services. This guide covers NGINX Ingress Controller, Application Gateway for Containers (AGC), and internal/public load balancers.

## Key Concepts

- **Ingress Controllers**: Manage external HTTP/HTTPS access to services
- **NGINX Ingress**: Open-source reverse proxy and load balancer
- **Application Gateway for Containers (AGC)**: Azure-native L7 load balancing
- **Load Balancer Services**: Layer 4 (TCP/UDP) traffic distribution
- **Internal Load Balancers**: Private endpoint exposure for internal traffic
- **TLS/SSL Termination**: Certificate management and HTTPS handling
- **Routing Rules**: Path and host-based routing configurations

## Resources

- 📄 [AKS App Routing Addon](https://learn.microsoft.com/en-us/azure/aks/app-routing)
- 📄 [Internal Load Balancer in AKS](https://learn.microsoft.com/en-us/azure/aks/internal-lb)
- 📄 [Standard Load Balancer in AKS](https://learn.microsoft.com/en-us/azure/aks/load-balancer-standard)

## Next Steps

- Deploy an ingress controller
- Configure TLS certificates
- Set up routing rules for your applications
