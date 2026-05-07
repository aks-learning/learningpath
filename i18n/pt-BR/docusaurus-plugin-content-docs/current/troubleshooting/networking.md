---
sidebar_position: 3
title: "Solução de problemas de rede"
description: "Árvores de decisão para falhas de rede no AKS: serviço inacessível, ingress quebrado, falhas de DNS, egress bloqueado e problemas de acesso a clusters privados."
---

# Solução de problemas de rede

Problemas de rede no AKS são os mais difíceis de depurar porque as falhas são silenciosas. Um pod não recebe tráfego e não há log de erro dizendo o motivo. Esta página oferece uma abordagem sistemática.

## Comece aqui

Antes de investigar falhas específicas, colete informações de base:

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

## Serviço inacessível

Um serviço ClusterIP ou LoadBalancer existe mas os clientes não recebem resposta.

### Árvore de decisão

**1. O serviço tem endpoints?**

```bash
kubectl get endpoints <service-name> -n <namespace>
```

| Resultado | Causa | Correção |
|---|---|---|
| Nenhum endpoint listado | Nenhum pod corresponde ao seletor do serviço | Corrija os labels dos pods para corresponder ao `spec.selector` do serviço |
| Endpoints existem mas IPs estão errados | Pods existem mas não estão Ready | Verifique as readiness probes, corrija o health check |
| Endpoints existem e parecem corretos | O problema está em outro lugar | Continue para o passo 2 |

**2. Os labels dos pods correspondem ao seletor do serviço?**

```bash
# Show service selector
kubectl get svc <service-name> -n <ns> -o jsonpath='{.spec.selector}'

# Show pod labels
kubectl get pods -n <ns> --show-labels
```

Os labels do seletor devem ser um subconjunto exato dos labels dos pods. Um único erro de digitação quebra tudo.

**3. Os pods estão realmente Ready?**

```bash
kubectl get pods -n <ns> -o wide | grep -v "1/1"
```

Se os pods mostram `0/1` ou `Running` mas não Ready, a readiness probe está falhando. O serviço não enviará tráfego para pods que não estão Ready.

**4. A porta está correta?**

```bash
kubectl get svc <service-name> -n <ns> -o yaml | grep -A 5 "ports:"
```

:::warning

A `port` do serviço é onde os clientes se conectam. O `targetPort` deve corresponder à porta em que seu container realmente escuta. Essas são frequentemente diferentes e mal configuradas.

:::

**5. Teste a conectividade de dentro do cluster:**

```bash
# Run a debug pod
kubectl run nettest --image=nicolaka/netshoot --rm -it -- bash

# From inside the debug pod
curl -v http://<service-name>.<namespace>.svc.cluster.local:<port>
```

---

## Ingress não funciona

O tráfego externo não está chegando ao seu aplicativo através de um recurso ingress.

### Árvore de decisão

**1. O ingress controller está rodando?**

```bash
# For NGINX ingress
kubectl get pods -n ingress-nginx

# For Application Gateway Ingress Controller (AGIC)
kubectl get pods -n kube-system -l app=ingress-appgw
```

Se o pod do controller não está Running, resolva isso primeiro. Nada mais importa.

**2. O recurso ingress existe e tem um endereço?**

```bash
kubectl get ingress -A
kubectl describe ingress <name> -n <ns>
```

| Sintoma | Causa | Correção |
|---|---|---|
| Coluna ADDRESS vazia | O controller não reconciliou o recurso | Verifique os logs do controller para erros |
| ADDRESS mostra um IP mas requisições dão timeout | O load balancer está saudável mas o backend não | Verifique o serviço e os pods do backend |
| 404 do ingress controller | Nenhuma regra corresponde ao host/caminho | Corrija o host e o caminho na spec do ingress |
| 502 Bad Gateway | O serviço backend existe mas os pods não estão respondendo | Verifique a saúde dos pods, readiness probes e targetPort |

**3. O TLS está configurado corretamente?**

```bash
# Check the secret exists
kubectl get secret <tls-secret-name> -n <ns>

# Verify the certificate
kubectl get secret <tls-secret-name> -n <ns> -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -dates -subject
```

:::tip

Certificados expirados são a causa número um de falhas de TLS no ingress. Configure o cert-manager com Let's Encrypt para automatizar a renovação. Nunca gerencie certificados TLS manualmente.

:::

**4. O DNS está apontando para o ingress?**

```bash
nslookup myapp.example.com
# The IP should match the ingress ADDRESS
kubectl get ingress <name> -n <ns> -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

---

## Falhas de resolução DNS

Pods não conseguem resolver nomes de serviço, hostnames externos ou ambos.

### Árvore de decisão

**1. O CoreDNS está rodando?**

```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50
```

Se os pods do CoreDNS estão em CrashLoopBackOff, o DNS do cluster inteiro está quebrado. Resolva isso imediatamente.

**2. Os pods conseguem resolver nomes internos?**

```bash
kubectl run dnstest --image=nicolaka/netshoot --rm -it -- \
  nslookup kubernetes.default.svc.cluster.local
```

| Resultado | Causa | Correção |
|---|---|---|
| Resolução bem-sucedida | DNS interno funciona, o problema é externo | Continue para o passo 3 |
| `connection timed out; no servers could be reached` | CoreDNS está inacessível | Verifique os pods do CoreDNS e o serviço `kube-dns` em `kube-system` |
| `server can't find` | Nome do serviço está errado ou não existe | Verifique se o serviço existe no namespace esperado |

**3. Os pods conseguem resolver nomes externos?**

```bash
kubectl run dnstest --image=nicolaka/netshoot --rm -it -- \
  nslookup microsoft.com
```

Se a resolução interna funciona mas a externa falha, verifique a configuração do CoreDNS:

```bash
kubectl get configmap coredns -n kube-system -o yaml
```

**4. Um DNS customizado está sobrescrevendo o Azure DNS?**

```bash
az network vnet show -g myRG -n myVNet --query "dhcpOptions.dnsServers"
```

:::warning

Se você definiu servidores DNS customizados na VNet, todas as consultas DNS dos pods vão para esses servidores primeiro. Se esses servidores não conseguem resolver nomes internos do Kubernetes, a descoberta de serviços quebra completamente. Use a abordagem de encaminhamento condicional: encaminhe `cluster.local` para o CoreDNS, todo o resto para seu DNS customizado.

:::

---

## Egress bloqueado

Pods não conseguem acessar serviços externos, registries ou APIs do Azure.

### Árvore de decisão

**1. Verifique as regras NSG na subnet:**

```bash
az network nsg list -g MC_myRG_myCluster_eastus2 -o table
az network nsg rule list -g MC_myRG_myCluster_eastus2 --nsg-name <nsg-name> -o table
```

**2. Verifique se o Azure Firewall ou um NVA está bloqueando tráfego:**

```bash
# Show the route table on the AKS subnet
az network route-table list -g MC_myRG_myCluster_eastus2 -o table
az network route-table route list -g MC_myRG_myCluster_eastus2 --route-table-name <table> -o table
```

Se uma UDR envia `0.0.0.0/0` para um firewall, esse firewall deve permitir o tráfego de saída obrigatório do AKS. Veja as regras obrigatórias na seção de Recursos.

**3. Verifique network policies bloqueando egress:**

```bash
kubectl get networkpolicy -n <ns> -o yaml
```

Procure por `policyTypes` que incluam `Egress`. Se uma política de egress existe, ela deve permitir explicitamente o destino.

**4. Teste a conectividade de saída a partir de um pod:**

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

Clusters AKS com `outboundType: userDefinedRouting` exigem que você permita explicitamente todo o egress. Os destinos mínimos obrigatórios incluem `mcr.microsoft.com`, `management.azure.com`, `login.microsoftonline.com` e as service tags da sua região Azure. A falta de qualquer um desses causa falhas no provisionamento de nós.

:::

---

## Cluster privado não conecta

Você não consegue executar comandos `kubectl` em um cluster AKS privado.

### Árvore de decisão

**1. Sua máquina consegue resolver o nome DNS do API server?**

```bash
nslookup <cluster-name>.<private-dns-zone>.privatelink.<region>.azmk8s.io
```

Se isso falhar, sua máquina não consegue ver a zona DNS privada. Você precisa de encaminhamento DNS ou um link direto para a zona DNS privada.

**2. Você está em uma rede que consegue alcançar o API server?**

Clusters privados não têm IP público no API server. Você precisa estar em:
- A mesma VNet ou uma VNet com peering
- Uma VPN conectada à VNet
- Um circuito ExpressRoute conectado à VNet
- Uma VM jumpbox dentro da VNet

**3. A zona DNS privada está vinculada à sua VNet?**

```bash
az network private-dns zone list -g MC_myRG_myCluster_eastus2 -o table
az network private-dns link vnet list -g MC_myRG_myCluster_eastus2 -z <zone-name> -o table
```

**4. Faixas de IP autorizadas estão bloqueando você?**

```bash
az aks show -g myRG -n myCluster --query "apiServerAccessProfile" -o yaml
```

Se `authorizedIpRanges` está definido, o IP do seu cliente deve estar na lista. Use `--api-server-authorized-ip-ranges ""` para limpá-las temporariamente para depuração.

:::tip

Para acesso diário a clusters privados, use `az aks command invoke`. Ele executa comandos kubectl através do plano de controle do Azure sem precisar de acesso VPN ou jumpbox.

```bash
az aks command invoke -g myRG -n myCluster --command "kubectl get pods -A"
```

:::

---

## Network policy bloqueando tráfego

Os pods estão rodando e os serviços têm endpoints, mas o tráfego ainda está bloqueado.

### Árvore de decisão

**1. Quais políticas afetam o pod alvo?**

```bash
# List all network policies in the namespace
kubectl get networkpolicy -n <ns>

# Check which ones select your pod
kubectl get networkpolicy -n <ns> -o json | \
  jq '.items[] | select(.spec.podSelector.matchLabels | to_entries[] | .key as $k | .value as $v | "'<pod-labels>'" | contains($k + "=" + $v)) | .metadata.name'
```

Abordagem mais simples: leia cada política no namespace e verifique se seu `podSelector` corresponde aos labels do seu pod.

**2. Entenda o comportamento de negação padrão:**

| Cenário | Resultado |
|---|---|
| Nenhuma network policy no namespace | Todo tráfego permitido (padrão) |
| Política com `podSelector: {}` e `Ingress` em `policyTypes` | Todo ingress bloqueado para todos os pods, a menos que explicitamente permitido |
| Política selecionando pods específicos com tipo `Ingress` | Apenas esses pods têm ingress restrito; outros pods não são afetados |
| Política com ambos `Ingress` e `Egress` em `policyTypes` | Ambas as direções bloqueadas para os pods selecionados, a menos que permitido |

**3. Erros comuns:**

| Erro | O que acontece | Correção |
|---|---|---|
| Permitir ingress pela porta mas protocolo errado | TCP é o padrão. Se seu app usa UDP, você deve especificar `protocol: UDP` | Adicione protocolo explícito à regra de porta |
| `namespaceSelector` faltando no ingress de outro namespace | Tráfego de outros namespaces é bloqueado mesmo se o seletor de pod corresponder | Adicione `namespaceSelector` com os labels do namespace de origem |
| Política de egress sem regra de egress para DNS | Pods não conseguem resolver nenhum nome DNS, causando falha em toda conectividade externa | Permita egress para `kube-system` na porta 53 (TCP e UDP) |

:::warning

Se você adicionar uma network policy com `policyTypes: ["Ingress"]` e uma lista `ingress: []` vazia, você criou uma negação padrão para todos os pods correspondentes. Esta é a causa mais comum de interrupção acidental por network policies.

:::

---

## Script de diagnóstico rápido

Execute isso para coletar o estado da rede de uma só vez:

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

## Recursos

- [AKS networking concepts](https://learn.microsoft.com/en-us/azure/aks/concepts-network)
- [Required outbound network rules for AKS](https://learn.microsoft.com/en-us/azure/aks/outbound-rules-control-egress)
- [Configure Azure CNI networking](https://learn.microsoft.com/en-us/azure/aks/configure-azure-cni)
- [Use network policies in AKS](https://learn.microsoft.com/en-us/azure/aks/use-network-policies)
- [Private AKS cluster](https://learn.microsoft.com/en-us/azure/aks/private-clusters)
- [CoreDNS customization](https://learn.microsoft.com/en-us/azure/aks/coredns-custom)
- [Troubleshoot DNS resolution in AKS](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/connectivity/troubleshoot-dns-failures)
- [Ingress controllers in AKS](https://learn.microsoft.com/en-us/azure/aks/app-routing)
