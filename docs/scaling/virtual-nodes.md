---
sidebar_position: 4
title: "Virtual Nodes"
description: "Burst capacity using Azure Container Instances for serverless Kubernetes workloads."
---

# Virtual Nodes

<span className="badge--advanced">🚀 Advanced</span>

Explore Virtual Nodes for bursting AKS workloads to Azure Container Instances (ACI). Achieve serverless Kubernetes for cost-effective handling of variable workloads.

## Key Concepts

- **Virtual Nodes**: ACI integration with AKS
- **Burst Capacity**: Handle traffic spikes without provisioning nodes
- **Serverless Containers**: Pay-per-second pricing model
- **Node Affinity**: Schedule workloads to Virtual Nodes
- **Container Groups**: Multi-container units on ACI
- **Persistent Volumes**: Limited storage options
- **Network Integration**: Azure VNet connectivity
- **Cost Considerations**: Per-container pricing vs. node-based

## Resources

- 📄 [Virtual Nodes (Burst to ACI)](https://learn.microsoft.com/en-us/azure/aks/concepts-scale#burst-to-azure-container-instances-aci)

## Next Steps

- Enable Virtual Nodes addon
- Configure ACI resource limits
- Schedule burst workloads to Virtual Nodes
