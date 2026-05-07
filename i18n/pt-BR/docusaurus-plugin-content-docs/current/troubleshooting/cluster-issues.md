---
sidebar_position: 4
title: "Solução de problemas do cluster"
description: "Árvores de decisão para problemas a nível de cluster no AKS: node NotReady, falhas de upgrade, API server inacessível, expiração de certificados e esgotamento de quota."
---

# Solução de problemas do cluster

A solução de problemas de pods cobre falhas de cargas de trabalho. Esta página cobre falhas a nível de cluster: quando os nós, o control plane ou a própria infraestrutura é o problema.

## Comece aqui

Execute isto antes de qualquer coisa. Ele informa se o problema são os nós, o control plane ou esgotamento de recursos em menos de 30 segundos.

```bash
# Status dos nós — algum nó NotReady?
kubectl get nodes -o wide

# Saúde do kube-system — cada pod deve estar Running
kubectl get pods -n kube-system -o wide

# Eventos a nível de cluster — ordenados por tempo, mais recentes por último
kubectl get events --sort-by='.lastTimestamp' -A | tail -30

# Estado do cluster AKS no Azure
az aks show -g <rg> -n <cluster> --query "{state:provisioningState,power:powerState.code,k8s:kubernetesVersion}" -o table
```

---

## Node NotReady

Um nó mostra `NotReady` em `kubectl get nodes`. Pods naquele nó param de receber tráfego e eventualmente são despejados.

### Árvore de decisão

**1. Identifique o nó NotReady e há quanto tempo ele está inativo:**

```bash
kubectl get nodes -o wide
kubectl describe node <node-name> | grep -A 10 "Conditions:"
```

**2. O que as condições indicam?**

| Condição | Significado | Correção |
|---|---|---|
| `MemoryPressure=True` | Nó está ficando sem memória | Despeje pods grandes, adicione nós ou aumente o tamanho da VM |
| `DiskPressure=True` | Uso de disco acima de 85% — kubelet começa a despejar pods | Limpe imagens com `crictl rmi --prune`, aumente o disco do SO |
| `PIDPressure=True` | Muitos processos | Encontre o pod que está criando processos excessivamente: `kubectl top pods --sort-by=cpu` |
| `Ready=False`, `KubeletNotReady` | Kubelet travou ou não consegue alcançar o API server | Acesse o nó via SSH e verifique os logs do kubelet |

**3. Verifique o status do kubelet no nó:**

```bash
# Use node-shell ou kubectl debug para acessar o nó
kubectl debug node/<node-name> -it --image=mcr.microsoft.com/cbl-mariner/busybox:2.0
# Dentro do pod de debug:
chroot /host
systemctl status kubelet
journalctl -u kubelet --no-pager --since "30 minutes ago"
```

**4. Verifique a saúde da VM no Azure:**

```bash
az vm get-instance-view \
  --ids $(az vmss list-instances -g MC_<rg>_<cluster>_<region> --vmss-name <vmss-name> --query "[].id" -o tsv) \
  --query "[].{name:name,status:instanceView.statuses[1].displayStatus}" -o table
```

**5. Se o nó é irrecuperável, recrie a imagem:**

```bash
# Para node pools baseados em VMSS (padrão)
az vmss reimage --resource-group MC_<rg>_<cluster>_<region> --name <vmss-name> --instance-ids <instance-id>
```

:::warning

Não recrie a imagem de múltiplos nós simultaneamente. Recrie um nó por vez e aguarde ele reingressar no cluster como `Ready` antes de prosseguir para o próximo.

:::

### Prevenção

Use o cluster autoscaler com `--min-count` definido para pelo menos 3 para pools de produção. Habilite a auto-reparação de nós — ela recria automaticamente a imagem de nós travados em `NotReady` por mais de 10 minutos:

```bash
az aks update -g <rg> -n <cluster> --enable-node-auto-repair
```

---

## Falhas de upgrade

Upgrades de cluster ou node pool ficam travados, deixam nós em estado de versão mista ou falham completamente.

### Árvore de decisão

**1. Verifique o status atual do upgrade:**

```bash
az aks show -g <rg> -n <cluster> --query "{state:provisioningState,k8s:kubernetesVersion}" -o table
az aks nodepool list -g <rg> --cluster-name <cluster> --query "[].{name:name,version:orchestratorVersion,state:provisioningState,count:count}" -o table
```

**2. O que o estado de provisionamento indica?**

| Estado | Significado | Ação |
|---|---|---|
| `Upgrading` | Upgrade em andamento | Aguarde. Verifique eventos de node drain para acompanhar o progresso |
| `Failed` | Upgrade falhou no meio | Verifique a mensagem de erro, corrija a causa, depois tente novamente |
| `Canceled` | Upgrade foi interrompido manualmente | Decida se deseja tentar novamente ou avançar |

**3. Se o PDB está bloqueando o node drain:**

Esta é a causa mais comum de falha de upgrade. Um PodDisruptionBudget impede o nó de ser drenado, e o upgrade trava.

```bash
# Encontre PDBs que estão bloqueando
kubectl get pdb -A
kubectl describe pdb <pdb-name> -n <namespace>
```

:::tip

Defina `maxUnavailable: 1` em vez de `minAvailable: 100%` nos PDBs. Um PDB com `minAvailable` igual à contagem de réplicas bloqueia todas as disrupções voluntárias, incluindo upgrades.

:::

**4. Aborte um upgrade travado:**

```bash
# Pare o upgrade — nós já atualizados permanecem na nova versão
az aks upgrade -g <rg> -n <cluster> --kubernetes-version <current-version> --no-wait
```

**5. Tente novamente após corrigir o bloqueio:**

```bash
az aks upgrade -g <rg> -n <cluster> --kubernetes-version <target-version>
```

### Prevenção

Sempre execute `az aks get-upgrades` antes de atualizar. Não pule mais de uma versão minor. Teste upgrades em um cluster de desenvolvimento primeiro — não porque a documentação diz para fazer, mas porque problemas de PDB e webhook só aparecem durante drains reais.

---

## API server inacessível

Comandos `kubectl` expiram por timeout ou retornam erros de conexão. Você não consegue gerenciar o cluster de forma alguma.

### Árvore de decisão

**1. Confirme que o problema é o API server, não a sua máquina:**

```bash
# Verifique se você consegue alcançar o endpoint do API server
kubectl cluster-info
# Verifique o contexto do seu kubeconfig
kubectl config current-context
# Obtenha credenciais novamente
az aks get-credentials -g <rg> -n <cluster> --overwrite-existing
```

**2. Restrinja a causa:**

| Sintoma | Causa provável | Correção |
|---|---|---|
| `Unable to connect to the server: dial tcp ... i/o timeout` | Faixas de IP autorizadas bloqueando seu IP | Adicione seu IP atual às faixas autorizadas |
| `Unable to connect to the server: EOF` | Cluster privado e você está fora da VNet | Conecte via VPN, jump box ou `az aks command invoke` |
| `error: You must be logged in to the server (Unauthorized)` | Token expirado ou kubelogin não configurado | Execute novamente `az login` e depois `az aks get-credentials` |
| `Unable to connect to the server: x509: certificate has expired` | Certificado do cliente expirado | Rotacione certificados do cluster (veja expiração de certificados abaixo) |

**3. Para problemas de faixa de IP autorizado:**

```bash
# Verifique as faixas autorizadas atuais
az aks show -g <rg> -n <cluster> --query "apiServerAccessProfile.authorizedIpRanges"

# Adicione seu IP atual
MY_IP=$(curl -s ifconfig.me)/32
az aks update -g <rg> -n <cluster> --api-server-authorized-ip-ranges "$MY_IP"
```

**4. Para clusters privados — use command invoke como recurso de emergência:**

```bash
az aks command invoke -g <rg> -n <cluster> --command "kubectl get nodes"
```

:::info

Use `az aks command invoke` apenas para emergências. É lento e tem um timeout de 60 segundos. Para acesso regular a clusters privados, configure uma VPN ou um jump box Azure Bastion dentro da VNet.

:::

**5. Para problemas com kubelogin:**

```bash
# Confirme que o kubelogin está instalado
kubelogin --version

# Converta o kubeconfig para usar login via device code
kubelogin convert-kubeconfig -l devicecode
```

---

## Expiração de certificados

O AKS rotaciona certificados do cluster automaticamente, mas a rotação pode falhar silenciosamente. Quando os certificados expiram, os nós se desconectam e chamadas à API falham com erros x509.

### Diagnóstico

**1. Verifique as datas de expiração dos certificados:**

```bash
az aks show -g <rg> -n <cluster> --query "{certExpiry:azurePortalFqdn}" -o table

# Mais detalhado — verifique o certificado real no API server
kubectl get nodes -o wide 2>&1 | grep -i "certificate"
```

**2. Verifique se a auto-rotação está funcionando:**

```bash
az aks show -g <rg> -n <cluster> --query "autoUpgradeProfile"
```

### Correção

**Force a rotação de certificados:**

```bash
az aks rotate-certs -g <rg> -n <cluster>
```

:::warning

`az aks rotate-certs` causa indisponibilidade. Ele reinicia todos os nós do cluster para captar os novos certificados. Agende isso durante uma janela de manutenção. A operação leva de 20 a 30 minutos para um cluster típico.

:::

### Prevenção

Habilite o canal de auto-upgrade. Clusters nos canais de auto-upgrade `patch` ou `stable` têm certificados rotacionados automaticamente como parte do ciclo de upgrade.

---

## Esgotamento de quota

Você não consegue criar novos nós, anexar discos ou obter IPs de pod. O Azure retorna erros de quota que aparecem como falhas vagas no Kubernetes.

### Árvore de decisão

**1. Identifique a quota esgotada:**

```bash
# Verifique a quota de vCPU para a região
az vm list-usage --location <region> -o table | grep -i "cores"

# Verifique a quota de rede
az network list-usages --location <region> -o table

# Verifique a quota de disco
az disk list -g MC_<rg>_<cluster>_<region> --query "length(@)"
```

**2. Falhas comuns de quota e como elas aparecem no Kubernetes:**

| Sintoma no Kubernetes | Quota do Azure atingida | Como confirmar |
|---|---|---|
| Nós travados em `Provisioning` | Limite regional de vCPU | `az vm list-usage --location <region>` |
| Pods travados em `Pending` com "no available addresses" | Esgotamento de IP da subnet | `az network vnet subnet show` — verifique IPs disponíveis |
| PVC travado em `Pending` | Limite de managed disk por assinatura | `az disk list --query "length(@)"` |
| Autoscaler não adicionando nós | Quota da família de VM excedida | Verifique a quota do SKU de VM específico |

**3. Solicite um aumento de quota:**

```bash
# Use a CLI do Azure para solicitar um aumento
az quota create \
  --resource-name "standardDSv3Family" \
  --scope "/subscriptions/<sub-id>/providers/Microsoft.Compute/locations/<region>" \
  --limit-object value=<new-limit> limit-object-type=LimitValue \
  --resource-type "dedicated"
```

:::tip

Não espere até atingir o limite. Configure alertas do Azure Monitor a 80% de uso da quota. Aumentos de quota são gratuitos e geralmente aprovados em horas, mas algumas famílias de VM levam dias.

:::

### Esgotamento de pod CIDR

Se você usa Azure CNI (não overlay), cada pod recebe um IP real da subnet. Uma subnet `/24` fornece 251 IPs utilizáveis — isso é aproximadamente 8 nós com 30 pods cada.

**Verifique IPs disponíveis:**

```bash
az network vnet subnet show \
  -g <rg> --vnet-name <vnet> -n <subnet> \
  --query "{addressPrefix:addressPrefix,availableIps:ipConfigurations.length(@)}" -o table
```

Use Azure CNI Overlay para novos clusters. Ele desacopla IPs de pod dos IPs de subnet, dando a cada nó um /24 de um range privado. Você nunca ficará sem IPs de pod.

---

## Erros do control plane

Pods do kube-system estão com problemas, CoreDNS está falhando ou admission webhooks estão bloqueando deployments.

### Falhas do CoreDNS

**Sintomas:** Pods não conseguem resolver nomes DNS. Services retornam `NXDOMAIN` ou expiram por timeout nas consultas DNS.

```bash
# Verifique pods do CoreDNS
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50

# Teste a resolução DNS de dentro do cluster
kubectl run dns-test --image=mcr.microsoft.com/cbl-mariner/busybox:2.0 --rm -it --restart=Never -- nslookup kubernetes.default
```

| Mensagem de log | Causa | Correção |
|---|---|---|
| `SERVFAIL` | DNS upstream inacessível | Verifique configurações de DNS da VNet e regras NSG |
| `i/o timeout` | Pod do CoreDNS não consegue alcançar o API server | Verifique conectividade do nó e kube-proxy |
| `REFUSED` | Servidor DNS customizado rejeitando consultas | Corrija a configuração do servidor DNS upstream |

### Falhas de webhook bloqueando deployments

**Sintomas:** `kubectl apply` retorna `Internal error occurred: failed calling webhook`. Deployments, pods ou namespaces não podem ser criados.

```bash
# Liste todos os webhooks
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations

# Verifique se o serviço do webhook está executando
kubectl get endpoints -n <webhook-namespace> <webhook-service>
```

:::warning

Um webhook com `failurePolicy: Fail` e um serviço de suporte inativo bloqueia todas as chamadas de API correspondentes. Se você está bloqueado, altere o webhook para `Ignore` ou exclua-o:

```bash
kubectl delete validatingwebhookconfiguration <name>
```

:::

### Crashes de pods do kube-system

Se qualquer pod do kube-system está em `CrashLoopBackOff`, o cluster está degradado. Verifique os logs imediatamente:

```bash
kubectl get pods -n kube-system | grep -v Running
kubectl logs -n kube-system <pod-name> --previous
kubectl describe pod -n kube-system <pod-name>
```

Não exclua pods do kube-system a menos que saiba exatamente o que está fazendo. A maioria é gerenciada pelo AKS e será recriada, mas alguns (como `konnectivity-agent`) requerem que o control plane esteja saudável primeiro.

---

## Latência do etcd e lentidão do API server

O cluster está executando mas comandos `kubectl` estão lentos, watches estão atrasados e controllers estão defasados da realidade.

### Sintomas

- `kubectl get pods` leva mais de 5 segundos
- Deployments levam minutos para fazer rollout
- HPA reage lentamente a mudanças de métricas
- Logs de auditoria do API server mostram alta latência em chamadas LIST

### Diagnóstico

```bash
# Verifique métricas do API server (se o endpoint de métricas está exposto)
kubectl get --raw /metrics | grep apiserver_request_duration_seconds

# Conte objetos — muitos objetos em um namespace é um sinal de alerta
kubectl get all -A --no-headers | wc -l

# Verifique chamadas LIST custosas (requer audit logging)
# Procure chamadas sem fieldSelector ou labelSelector
kubectl get events -A --no-headers | wc -l
```

### Causas comuns e correções

| Causa | Como confirmar | Correção |
|---|---|---|
| Muitos objetos Events | `kubectl get events -A --no-headers \| wc -l` retorna 10.000+ | Defina TTL de eventos com `--event-ttl` ou limpe eventos antigos |
| CRDs com milhares de instâncias | `kubectl get <crd> -A --no-headers \| wc -l` | Pagine chamadas list, adicione índices ou arquive CRs antigos |
| Controllers fazendo chamadas LIST sem filtro | Logs de auditoria do API server | Corrija o código do controller para usar field selectors e label selectors |
| Secrets ou ConfigMaps grandes | `kubectl get secrets -A -o json \| jq '.items[].data \| length'` | Divida secrets grandes, use stores de segredos externos |
| Muitos watches | Uso de memória do API server crescendo | Reduza a cardinalidade de watches em controllers customizados |

:::tip

Use `--field-selector` e `--label-selector` em cada chamada LIST em controllers customizados. Um `LIST pods` sem filtro em um cluster com 10.000 pods puxa a lista completa de pods do etcd para a memória do API server em cada chamada.

:::

### Prevenção

Defina resource quotas por namespace para evitar que qualquer equipe crie objetos sem limite:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: object-limits
  namespace: team-a
spec:
  hard:
    configmaps: "100"
    secrets: "100"
    services: "20"
    pods: "200"
```

---

## Verificação rápida de saúde do cluster

Execute este script para obter um snapshot abrangente da saúde do cluster. Salve-o como `cluster-health.sh` e execute antes de abrir um chamado de suporte.

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Cluster info ==="
kubectl cluster-info

echo -e "\n=== Node status ==="
kubectl get nodes -o wide

echo -e "\n=== Node conditions (NotReady or pressure) ==="
kubectl get nodes -o json | jq -r '
  .items[] |
  select(.status.conditions[] |
    select(.type != "Ready" and .status == "True") or
    select(.type == "Ready" and .status != "True")
  ) |
  .metadata.name + ": " +
  ([.status.conditions[] | select(.status == "True" or (.type == "Ready" and .status != "True")) | .type + "=" + .status] | join(", "))'

echo -e "\n=== kube-system pods not Running ==="
kubectl get pods -n kube-system --field-selector=status.phase!=Running 2>/dev/null || echo "All kube-system pods are Running"

echo -e "\n=== Cluster events (warnings only, last 30 min) ==="
kubectl get events -A --field-selector=type=Warning --sort-by='.lastTimestamp' | tail -20

echo -e "\n=== Resource usage ==="
kubectl top nodes 2>/dev/null || echo "Metrics server not available"

echo -e "\n=== PDBs that may block upgrades ==="
kubectl get pdb -A -o json | jq -r '
  .items[] |
  select(.status.disruptionsAllowed == 0) |
  .metadata.namespace + "/" + .metadata.name + " — disruptionsAllowed: 0"'

echo -e "\n=== Pending PVCs ==="
kubectl get pvc -A --field-selector=status.phase=Pending 2>/dev/null || echo "No pending PVCs"

echo -e "\n=== AKS cluster state ==="
az aks show -g "${1:-myRG}" -n "${2:-myCluster}" \
  --query "{state:provisioningState,power:powerState.code,k8s:kubernetesVersion,nodeRG:nodeResourceGroup}" -o table 2>/dev/null || echo "Provide resource group and cluster name as arguments"
```

---

## Quando contatar o suporte Azure

Nem todo problema requer um chamado de suporte. Use esta matriz de severidade para decidir.

### Matriz de severidade

| Severidade | Quando usar | Exemplo | Resposta esperada |
|---|---|---|---|
| A / Crítico | Produção fora do ar, sem solução alternativa | Todos os nós NotReady, API server inacessível | 1 hora (com Premier/Unified) |
| B / Alto | Produção comprometida, solução alternativa existe | Upgrades falhando, um node pool inativo | 4 horas |
| C / Padrão | Problema não crítico | Aumento de quota necessário, degradação menor | 8 horas comerciais |

### O que coletar antes de abrir um chamado

O Suporte Azure pedirá tudo isso. Colete antecipadamente para evitar idas e vindas:

```bash
# 1. ID do recurso do cluster
az aks show -g <rg> -n <cluster> --query id -o tsv

# 2. Estado e versão do cluster
az aks show -g <rg> -n <cluster> --query "{state:provisioningState,version:kubernetesVersion}" -o json

# 3. Detalhes dos node pools
az aks nodepool list -g <rg> --cluster-name <cluster> -o table

# 4. Operações recentes do cluster
az aks operation-abort list -g <rg> -n <cluster> 2>/dev/null
az monitor activity-log list --resource-group <rg> --offset 1h --query "[?status.value=='Failed']" -o table

# 5. Eventos e status de pods do Kubernetes
kubectl get events -A --sort-by='.lastTimestamp' > cluster-events.txt
kubectl get pods -A -o wide > all-pods.txt
kubectl describe nodes > node-details.txt
```

:::info

Sempre inclua o **correlation ID** dos comandos Azure CLI que falharam. Ele é impresso na saída de erro e permite que o suporte rastreie a chamada de API exata que falhou no backend deles.

:::

---

## Recursos

- [Solução de problemas comuns do AKS](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/welcome-azure-kubernetes)
- [Solução de problemas de nó NotReady no AKS](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/availability-performance/node-not-ready-basic-troubleshooting)
- [Rotação de certificados no AKS](https://learn.microsoft.com/en-us/azure/aks/certificate-rotation)
- [Boas práticas de upgrade do AKS](https://learn.microsoft.com/en-us/azure/aks/upgrade-aks-cluster)
- [Limites de quota para assinaturas Azure](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits)
- [Solução de problemas do API server e etcd](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/availability-performance/troubleshoot-apiserver-etcd)
- [Visão geral de diagnóstico do AKS](https://learn.microsoft.com/en-us/azure/aks/aks-diagnostics)
- [Solução de problemas do CoreDNS no AKS](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/connectivity/troubleshoot-dns-failure-from-pod-but-not-from-node)
