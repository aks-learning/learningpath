---
sidebar_position: 3
title: "KEDA"
description: "Implement event-driven autoscaling for Kubernetes with KEDA and various event sources."
---

# KEDA

<span className="badge--intermediate">📚 Intermediate</span>

Master KEDA (Kubernetes Event Autoscaling) for event-driven pod scaling. Scale workloads based on queue depth, messages, or custom events from various sources.

## Key Concepts

- **Event-Driven Scaling**: Scale based on events, not just metrics
- **Scalers**: Pre-built connectors for various event sources
- **Azure Service Bus**: Queue and topic-based scaling
- **Azure Storage Queues**: Queue message depth scaling
- **Custom Scalers**: Define custom scaling logic
- **Scaling Rules**: Multiple scaling conditions
- **Fallback Scaling**: Graceful degradation when metrics unavailable
- **ScaledObjects**: Declarative KEDA configuration

## Resources

- 📄 [KEDA for AKS](https://learn.microsoft.com/en-us/azure/aks/keda-about)

## Next Steps

- Install KEDA on your cluster
- Configure scalers for your event sources
- Test event-driven scaling behavior
