---
sidebar_position: 2
title: "Cluster Autoscaler & NAP"
description: "Automatically scale cluster nodes and use Node Autoprovision for dynamic node pool management."
---

# Cluster Autoscaler & NAP

<span className="badge--intermediate">📚 Intermediate</span>

Understand Cluster Autoscaler for automatic node scaling and Node Autoprovision (NAP) for dynamic node pool management. Scale your infrastructure to meet workload demands.

## Key Concepts

- **Cluster Autoscaler**: Automatically add and remove nodes
- **Node Autoprovision**: Dynamically create node pools for workload requirements
- **Scaling Triggers**: Unschedulable pods trigger node provisioning
- **Scale-down Logic**: Remove underutilized nodes safely
- **Pod Disruption Budgets**: Ensure graceful node shutdown
- **Multi-zone Scaling**: Distribute nodes across availability zones
- **Cost Optimization**: Right-size node pools automatically
- **Configuration Options**: Scaling thresholds and limits

## Resources

- 📄 [Cluster Autoscaler Concepts](https://learn.microsoft.com/en-us/azure/aks/concepts-scale#cluster-autoscaler)

## Next Steps

- Enable Cluster Autoscaler on node pools
- Configure scaling parameters and thresholds
- Test scaling with sample workloads
