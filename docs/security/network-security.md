---
sidebar_position: 3
title: "Network Security"
description: "Defense-in-depth network security for AKS with network policies, egress lockdown, and Cilium-based observability."
---

# Network Security

Network policies are mandatory in production. If your cluster allows unrestricted pod-to-pod communication and open egress to the internet, you have zero network security and a breach waiting to happen. Default-deny all traffic, then allow explicitly.

## The Layers

Network security in AKS is not one thing -- it is three distinct layers that must all be configured:

| Layer | Tool | Controls |
|-------|------|----------|
| Subnet/NIC level | NSGs (Network Security Groups) | Broad ingress/egress at the Azure networking layer |
| In-cluster pod traffic | Network Policies | Pod-to-pod and pod-to-service communication |
| Cluster egress to internet | Azure Firewall / NAT Gateway | FQDN filtering, prevent data exfiltration |

All three layers are required. NSGs alone do not see pod-to-pod traffic within the same subnet. Network policies alone do not control egress to external services.

## Network Policy Engine: The Decision

| Engine | L3/L4 Policies | L7 Policies | Observability | Performance | Verdict |
|--------|---------------|-------------|---------------|-------------|---------|
| Azure NPM | Yes | No | None | Moderate | Legacy. Avoid for new clusters. |
| Calico | Yes | Limited | Basic | Good | Acceptable if already invested |
| Cilium | Yes | Yes (HTTP, gRPC, DNS) | Hubble (excellent) | Best (eBPF) | Use this. |

:::tip
Use Cilium. It is the only engine that gives you L7 policies (filter by HTTP path, gRPC method, DNS name) combined with eBPF-based observability through Hubble. You can see every network flow in your cluster in real time. Azure now supports Cilium natively via Azure CNI Powered by Cilium.
:::

```bash
az aks create \
  --resource-group myRG \
  --name myCluster \
  --network-plugin azure \
  --network-plugin-mode overlay \
  --network-dataplane cilium \
  --network-policy cilium
```

## Default Deny: Start Here

Apply this to every namespace before deploying any workloads:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

This blocks all traffic in and out of every pod in the namespace. Then add explicit allow policies for each legitimate communication path.

## Allow Only What Is Needed

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-api
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api-server
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-egress-to-db
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api-server
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:  # Allow DNS resolution
    - namespaceSelector: {}
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
```

:::info
Always include a DNS egress rule. Without it, pods cannot resolve service names and will fail in confusing ways that look like application bugs rather than network policy issues.
:::

## Egress Lockdown

Leaving egress wide open (`0.0.0.0/0` to internet) means any compromised pod can exfiltrate data to any external endpoint. Lock it down.

| Approach | When to Use | Cost |
|----------|-------------|------|
| Azure Firewall with FQDN rules | Enterprise, compliance requirements, full logging | High (~$900/month minimum) |
| NAT Gateway + NSG | Cost-sensitive, basic egress control | Low (~$45/month) |
| Cilium FQDN policies | In-cluster DNS-based filtering, no extra infra | Free (but less visibility at Azure layer) |

For production clusters handling sensitive data, use Azure Firewall with application rules that allow only specific FQDNs:

```bash
# Allow only required egress destinations
az network firewall application-rule create \
  --resource-group myRG \
  --firewall-name myFirewall \
  --collection-name aks-required \
  --priority 200 \
  --action Allow \
  --name aks-fqdn \
  --protocols Https=443 \
  --target-fqdns "mcr.microsoft.com" "*.data.mcr.microsoft.com" "management.azure.com" "login.microsoftonline.com"
```

## Common Mistakes

1. **No network policies at all** -- The default in Kubernetes is allow-all. Without explicit policies, every pod can talk to every other pod. This is unacceptable in production.
2. **Egress wide open** -- Pods should not reach the public internet unless explicitly required. A compromised container with open egress can download tools, exfiltrate data, or join a botnet.
3. **Forgetting DNS in egress policies** -- Default-deny egress blocks DNS too. Your pods will fail to resolve any service names. Always allow UDP/53 to kube-dns.
4. **Applying policies without testing** -- Use `enforce` mode only after validating with `audit` or dry-run. A bad network policy can take down your entire application instantly.
5. **NSGs as the only control** -- NSGs cannot see pod-to-pod traffic within the same subnet (same source/dest CIDR). They are necessary but not sufficient.

## Resources

- [Network Policies in AKS](https://learn.microsoft.com/en-us/azure/aks/use-network-policies)
- [Azure CNI Powered by Cilium](https://learn.microsoft.com/en-us/azure/aks/azure-cni-powered-by-cilium)
- [AKS Egress with Azure Firewall](https://learn.microsoft.com/en-us/azure/aks/limit-egress-traffic)
- [Cilium Network Policy Reference](https://docs.cilium.io/en/stable/security/policy/)
- [Hubble Observability](https://docs.cilium.io/en/stable/observability/)
