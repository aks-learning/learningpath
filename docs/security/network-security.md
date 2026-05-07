---
sidebar_position: 3
title: "Network Security"
description: "Implement network policies and network security groups to control traffic flow within and between AKS workloads."
---

# Network Security

<span className="badge--intermediate">📚 Intermediate</span>

Learn to implement network policies and network security groups (NSGs) for defense-in-depth network security. Control ingress and egress traffic at the pod and subnet levels.

## Key Concepts

- **Network Policies**: Kubernetes-native traffic filtering
- **NSG Rules**: Azure-level network security groups
- **Ingress Rules**: Control incoming traffic to pods
- **Egress Rules**: Control outgoing traffic from pods
- **Label Selectors**: Policy targeting based on pod labels
- **Default Deny Patterns**: Explicit allow policies for zero-trust
- **DNS Policy**: DNS egress control and filtering
- **Compliance**: Meeting security and regulatory requirements

## Resources

- 📄 [Network Policies in AKS](https://learn.microsoft.com/en-us/azure/aks/use-network-policies)

## Next Steps

- Design network policy strategy
- Implement pod-to-pod communication rules
- Set up NSGs for subnet protection
