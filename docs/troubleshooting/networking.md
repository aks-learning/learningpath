---
sidebar_position: 3
title: "Network troubleshooting"
description: "Decision trees for AKS networking failures: service not reachable, ingress broken, DNS failures, egress blocked, and private cluster access issues."
---

# Network troubleshooting

Networking issues in AKS are the hardest to debug because failures are silent. A pod gets no traffic and there is no error log telling you why. This page gives you a systematic approach.

## Start here

Before diving into specific failures, collect baseline information:

```bash
# Cluster networking model
az aks show -g myRG -n myCluster --query "networkProfile" -o table

# Node status and IPs
kubectl get nodes -o wide

# All services and their endpoints
kubectl get svc -A

# All network policies
kubectl get networkpolicy -A
```

---

## Service not reachable

A ClusterIP or LoadBalancer service exists but clients get no response.

### Decision tree

**1. Does the service have endpoints?**

```bash
kubectl get endpoints <service-name> -n <namespace>
```

| Result | Cause | Fix |
|---|---|---|
| No endpoints listed | No pods match the service selector | Fix pod labels to match service `spec.selector` |
| Endpoints exist but IPs are wrong | Pods exist but are not Ready | Check readiness probes, fix the health check |
| Endpoints exist and look correct | Problem is elsewhere | Continue to step 2 |

**2. Do pod labels match the service selector?**

```bash
# Show service selector
kubectl get svc <service-name> -n <ns> -o jsonpath='{.spec.selector}'

# Show pod labels
kubectl get pods -n <ns> --show-labels
```

The selector labels must be an exact subset of the pod labels. A single typo breaks everything.

**3. Are the pods actually Ready?**

```bash
kubectl get pods -n <ns> -o wide | grep -v "1/1"
```

If pods show `0/1` or `Running` but not Ready, the readiness probe is failing. The service will not send traffic to pods that are not Ready.

**4. Does the port match?**

```bash
kubectl get svc <service-name> -n <ns> -o yaml | grep -A 5 "ports:"
```

:::warning

The service `port` is what clients connect to. The `targetPort` must match the port your container actually listens on. These are often different and misconfigured.

:::

**5. Test connectivity from inside the cluster:**

```bash
# Run a debug pod
kubectl run nettest --image=nicolaka/netshoot --rm -it -- bash

# From inside the debug pod
curl -v http://<service-name>.<namespace>.svc.cluster.local:<port>
```

---

## Ingress not working

External traffic is not reaching your application through an ingress resource.

### Decision tree

**1. Is the ingress controller running?**

```bash
# For NGINX ingress
kubectl get pods -n ingress-nginx

# For Application Gateway Ingress Controller (AGIC)
kubectl get pods -n kube-system -l app=ingress-appgw
```

If the controller pod is not Running, fix that first. Nothing else matters.

**2. Does the ingress resource exist and have an address?**

```bash
kubectl get ingress -A
kubectl describe ingress <name> -n <ns>
```

| Symptom | Cause | Fix |
|---|---|---|
| ADDRESS column is empty | Controller has not reconciled the resource | Check controller logs for errors |
| ADDRESS shows an IP but requests timeout | Load balancer is healthy but backend is not | Check the backend service and pods |
| 404 from the ingress controller | No matching rule for the host/path | Fix host and path in the ingress spec |
| 502 Bad Gateway | Backend service exists but pods are not responding | Check pod health, readiness probes, and targetPort |

**3. Is TLS configured correctly?**

```bash
# Check the secret exists
kubectl get secret <tls-secret-name> -n <ns>

# Verify the certificate
kubectl get secret <tls-secret-name> -n <ns> -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -dates -subject
```

:::tip

Expired certificates are the number one cause of TLS ingress failures. Set up cert-manager with Let's Encrypt to automate renewal. Never manage TLS certificates manually.

:::

**4. Is DNS pointing to the ingress?**

```bash
nslookup myapp.example.com
# The IP should match the ingress ADDRESS
kubectl get ingress <name> -n <ns> -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

---

## DNS resolution failures

Pods cannot resolve service names, external hostnames, or both.

### Decision tree

**1. Is CoreDNS running?**

```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
```

If CoreDNS pods are in CrashLoopBackOff, the entire cluster DNS is broken. Fix this immediately.

**2. Can pods resolve internal names?**

```bash
kubectl run dnstest --image=nicolaka/netshoot --rm -it -- \
  nslookup kubernetes.default.svc.cluster.local
```

| Result | Cause | Fix |
|---|---|---|
| Resolution succeeds | Internal DNS works, problem is external | Continue to step 3 |
| `connection timed out; no servers could be reached` | CoreDNS is unreachable | Check CoreDNS pods and the `kube-dns` service in `kube-system` |
| `server can't find` | Service name is wrong or does not exist | Verify the service exists in the expected namespace |

**3. Can pods resolve external names?**

```bash
kubectl run dnstest --image=nicolaka/netshoot --rm -it -- \
  nslookup microsoft.com
```

If internal resolution works but external fails, check the CoreDNS configuration:

```bash
kubectl get configmap coredns -n kube-system -o yaml
```

**4. Is custom DNS overriding Azure DNS?**

```bash
az network vnet show -g myRG -n myVNet --query "dhcpOptions.dnsServers"
```

:::warning

If you set custom DNS servers on the VNet, all DNS queries from pods go to those servers first. If those servers cannot resolve Kubernetes internal names, service discovery breaks completely. Use the conditional forwarding approach: forward `cluster.local` to CoreDNS, everything else to your custom DNS.

:::

---

## Egress blocked

Pods cannot reach external services, registries, or Azure APIs.

### Decision tree

**1. Check NSG rules on the subnet:**

```bash
az network nsg list -g MC_myRG_myCluster_eastus2 -o table
az network nsg rule list -g MC_myRG_myCluster_eastus2 --nsg-name <nsg-name> -o table
```

**2. Check if Azure Firewall or an NVA is blocking traffic:**

```bash
# Show the route table on the AKS subnet
az network route-table list -g MC_myRG_myCluster_eastus2 -o table
az network route-table route list -g MC_myRG_myCluster_eastus2 --route-table-name <table> -o table
```

If a UDR sends `0.0.0.0/0` to a firewall, that firewall must allow AKS required outbound traffic. See the required rules in the Resources section.

**3. Check network policies blocking egress:**

```bash
kubectl get networkpolicy -n <ns> -o yaml
```

Look for `policyTypes` that include `Egress`. If an egress policy exists, it must explicitly allow the destination.

**4. Test outbound connectivity from a pod:**

```bash
kubectl run egresstest --image=nicolaka/netshoot --rm -it -- bash

# Test HTTPS
curl -v https://mcr.microsoft.com
# Test DNS
nslookup mcr.microsoft.com
# Test specific port
nc -zv <destination-ip> <port>
```

:::info

AKS clusters with `outboundType: userDefinedRouting` require you to explicitly allow all egress. The minimum required destinations include `mcr.microsoft.com`, `management.azure.com`, `login.microsoftonline.com`, and your Azure region's service tags. Missing any of these causes node provisioning failures.

:::

---

## Private cluster cannot connect

You cannot run `kubectl` commands against a private AKS cluster.

### Decision tree

**1. Can your machine resolve the API server DNS name?**

```bash
nslookup <cluster-name>.<private-dns-zone>.privatelink.<region>.azmk8s.io
```

If this fails, your machine cannot see the private DNS zone. You need DNS forwarding or a direct link to the private DNS zone.

**2. Are you on a network that can reach the API server?**

Private clusters have no public IP on the API server. You must be on:
- The same VNet or a peered VNet
- A VPN connected to the VNet
- An ExpressRoute circuit connected to the VNet
- A jumpbox VM inside the VNet

**3. Is the private DNS zone linked to your VNet?**

```bash
az network private-dns zone list -g MC_myRG_myCluster_eastus2 -o table
az network private-dns link vnet list -g MC_myRG_myCluster_eastus2 -z <zone-name> -o table
```

**4. Are authorized IP ranges blocking you?**

```bash
az aks show -g myRG -n myCluster --query "apiServerAccessProfile" -o yaml
```

If `authorizedIpRanges` is set, your client IP must be in the list. Use `--api-server-authorized-ip-ranges ""` to clear them temporarily for debugging.

:::tip

For day-to-day private cluster access, use `az aks command invoke`. It runs kubectl commands through Azure's control plane without needing VPN or jumpbox access.

```bash
az aks command invoke -g myRG -n myCluster --command "kubectl get pods -A"
```

:::

---

## Network policy blocking traffic

Pods are running and services have endpoints, but traffic is still blocked.

### Decision tree

**1. Which policies affect the target pod?**

```bash
# List all network policies in the namespace
kubectl get networkpolicy -n <ns>

# Check which ones select your pod
kubectl get networkpolicy -n <ns> -o json | \
  jq '.items[] | select(.spec.podSelector.matchLabels | to_entries[] | .key as $k | .value as $v | "'<pod-labels>'" | contains($k + "=" + $v)) | .metadata.name'
```

Simpler approach: read each policy in the namespace and check if its `podSelector` matches your pod labels.

**2. Understand the default deny behavior:**

| Scenario | Result |
|---|---|
| No network policies in namespace | All traffic allowed (default) |
| Policy with `podSelector: {}` and `Ingress` in `policyTypes` | All ingress blocked for all pods unless explicitly allowed |
| Policy selecting specific pods with `Ingress` type | Only those pods have ingress restricted; other pods are unaffected |
| Policy with both `Ingress` and `Egress` in `policyTypes` | Both directions blocked for selected pods unless allowed |

**3. Common mistakes:**

| Mistake | What happens | Fix |
|---|---|---|
| Allowing ingress by port but wrong protocol | TCP is the default. If your app uses UDP, you must specify `protocol: UDP` | Add explicit protocol to the port rule |
| Missing `namespaceSelector` on ingress from another namespace | Traffic from other namespaces is blocked even if the pod selector matches | Add `namespaceSelector` with the source namespace labels |
| Egress policy missing DNS egress rule | Pods cannot resolve any DNS names, causing all external connectivity to fail | Allow egress to `kube-system` on port 53 (TCP and UDP) |

:::warning

If you add a network policy with `policyTypes: ["Ingress"]` and an empty `ingress: []` list, you have created a default deny for all matched pods. This is the most common accidental outage caused by network policies.

:::

---

## Quick diagnosis script

Run this to collect networking state in one shot:

```bash
#!/bin/bash
NS=${1:-default}
echo "=== Nodes ==="
kubectl get nodes -o wide
echo ""
echo "=== Services in $NS ==="
kubectl get svc -n "$NS" -o wide
echo ""
echo "=== Endpoints in $NS ==="
kubectl get endpoints -n "$NS"
echo ""
echo "=== Ingress in $NS ==="
kubectl get ingress -n "$NS"
echo ""
echo "=== Network Policies in $NS ==="
kubectl get networkpolicy -n "$NS"
echo ""
echo "=== CoreDNS pods ==="
kubectl get pods -n kube-system -l k8s-app=kube-dns -o wide
echo ""
echo "=== Recent CoreDNS logs ==="
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=20
echo ""
echo "=== DNS test (internal) ==="
kubectl run dnscheck --image=busybox:1.36 --rm -it --restart=Never -- \
  nslookup kubernetes.default.svc.cluster.local 2>&1 || true
echo ""
echo "=== DNS test (external) ==="
kubectl run dnscheck2 --image=busybox:1.36 --rm -it --restart=Never -- \
  nslookup microsoft.com 2>&1 || true
```

---

## Resources

- [AKS networking concepts](https://learn.microsoft.com/en-us/azure/aks/concepts-network)
- [Required outbound network rules for AKS](https://learn.microsoft.com/en-us/azure/aks/outbound-rules-control-egress)
- [Configure Azure CNI networking](https://learn.microsoft.com/en-us/azure/aks/configure-azure-cni)
- [Use network policies in AKS](https://learn.microsoft.com/en-us/azure/aks/use-network-policies)
- [Private AKS cluster](https://learn.microsoft.com/en-us/azure/aks/private-clusters)
- [CoreDNS customization](https://learn.microsoft.com/en-us/azure/aks/coredns-custom)
- [Troubleshoot DNS resolution in AKS](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/connectivity/troubleshoot-dns-failures)
- [Ingress controllers in AKS](https://learn.microsoft.com/en-us/azure/aks/app-routing)
