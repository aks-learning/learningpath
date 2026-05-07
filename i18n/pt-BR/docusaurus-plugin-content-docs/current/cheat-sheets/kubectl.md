---
sidebar_position: 1
title: "Cheat sheet kubectl"
description: "Referência rápida de comandos kubectl que você realmente usa durante incidentes, depuração e operações diárias no AKS."
---

# Cheat sheet kubectl

Isto não é uma cópia da documentação do kubectl. Este é o conjunto de comandos que você precisa quando algo está quebrado às 2 da manhã e você precisa de respostas rápidas.

## Triagem de pods

```bash
# What pods are not running?
kubectl get pods -A --field-selector=status.phase!=Running

# Why is a pod stuck?
kubectl describe pod <pod> -n <ns> | grep -A 10 "Events:"

# Get logs from a crashing container (previous instance)
kubectl logs <pod> -n <ns> --previous

# Get logs from a specific container in a multi-container pod
kubectl logs <pod> -n <ns> -c <container>

# Stream logs in real time
kubectl logs -f <pod> -n <ns> --tail=100

# Get logs from all pods matching a label
kubectl logs -l app=myapp -n <ns> --all-containers --tail=50
```

## Decodificador rápido de status de pod

| Status | O que significa | Primeiro comando a executar |
|--------|----------------|----------------------------|
| `Pending` | Nenhum nó pode agendá-lo | `kubectl describe pod <pod> -n <ns>` — verifique Events para falhas de agendamento |
| `CrashLoopBackOff` | O contêiner inicia e depois morre | `kubectl logs <pod> -n <ns> --previous` — verifique por que ele falhou |
| `ImagePullBackOff` | Não é possível baixar a imagem do contêiner | `kubectl describe pod <pod> -n <ns>` — verifique o nome da imagem, autenticação do registro |
| `OOMKilled` | O contêiner excedeu o limite de memória | `kubectl describe pod <pod> -n <ns>` — verifique `Last State` para exit code 137 |
| `CreateContainerError` | A configuração do contêiner é inválida | `kubectl describe pod <pod> -n <ns>` — verifique montagens de volume, secrets, configmaps |
| `Init:Error` | O init container falhou | `kubectl logs <pod> -n <ns> -c <init-container>` |
| `Terminating` (travado) | Finalizers ou PDB bloqueando | `kubectl get pod <pod> -n <ns> -o jsonpath='{.metadata.finalizers}'` |
| `Evicted` | O nó ficou sem recursos | `kubectl get events -n <ns> --field-selector reason=Evicted` |

## Inspeção de nós

```bash
# Node status overview
kubectl get nodes -o wide

# Which node is a pod running on?
kubectl get pod <pod> -n <ns> -o jsonpath='{.spec.nodeName}'

# What is consuming resources on a node?
kubectl describe node <node> | grep -A 20 "Allocated resources"

# Top resource consumers
kubectl top nodes
kubectl top pods -A --sort-by=memory | head -20
kubectl top pods -A --sort-by=cpu | head -20

# Check node conditions (disk pressure, memory pressure, PID pressure)
kubectl get nodes -o custom-columns='NAME:.metadata.name,CONDITIONS:.status.conditions[?(@.status=="True")].type'

# Cordon a node (prevent new scheduling, existing pods stay)
kubectl cordon <node>

# Drain a node (evict pods gracefully)
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data

# Uncordon after maintenance
kubectl uncordon <node>
```

## Depuração de rede

```bash
# Check service endpoints (are pods actually backing the service?)
kubectl get endpoints <service> -n <ns>

# DNS resolution from inside the cluster
kubectl run dns-test --rm -it --image=busybox:1.36 --restart=Never -- nslookup <service>.<ns>.svc.cluster.local

# Test connectivity from a debug pod
kubectl run net-test --rm -it --image=nicolaka/netshoot --restart=Never -- curl -v http://<service>.<ns>.svc.cluster.local

# Check ingress resources and their backends
kubectl get ingress -A
kubectl describe ingress <ingress> -n <ns>

# List network policies affecting a namespace
kubectl get networkpolicies -n <ns>

# Check if a service has external IP assigned
kubectl get svc -A --field-selector spec.type=LoadBalancer
```

## Eventos e diagnósticos

```bash
# Recent events cluster-wide (sorted by time)
kubectl get events -A --sort-by='.lastTimestamp' | tail -30

# Events for a specific namespace
kubectl get events -n <ns> --sort-by='.lastTimestamp'

# Warning events only
kubectl get events -A --field-selector type=Warning --sort-by='.lastTimestamp' | tail -20

# Check component status
kubectl get componentstatuses 2>/dev/null || echo "Deprecated in newer K8s versions"
kubectl get --raw='/readyz?verbose'
```

## Deployments e rollouts

```bash
# Check rollout status
kubectl rollout status deployment/<name> -n <ns>

# View rollout history
kubectl rollout history deployment/<name> -n <ns>

# Rollback to previous version immediately
kubectl rollout undo deployment/<name> -n <ns>

# Rollback to a specific revision
kubectl rollout undo deployment/<name> -n <ns> --to-revision=3

# Restart all pods in a deployment (rolling restart)
kubectl rollout restart deployment/<name> -n <ns>

# Scale a deployment
kubectl scale deployment/<name> -n <ns> --replicas=5

# Check HPA status
kubectl get hpa -n <ns>
kubectl describe hpa <name> -n <ns>
```

## Secrets e ConfigMaps

```bash
# List secrets in a namespace
kubectl get secrets -n <ns>

# View a secret value (base64 decoded)
kubectl get secret <name> -n <ns> -o jsonpath='{.data.<key>}' | base64 -d

# Check if a ConfigMap exists and see its keys
kubectl get configmap <name> -n <ns> -o jsonpath='{.data}' | python -m json.tool

# Check which pods reference a specific secret
kubectl get pods -n <ns> -o json | jq '.items[] | select(.spec.volumes[]?.secret.secretName == "<secret-name>") | .metadata.name'
```

## Uso de recursos e quotas

```bash
# Check resource quotas
kubectl get resourcequota -n <ns>
kubectl describe resourcequota -n <ns>

# Check limit ranges
kubectl get limitrange -n <ns>

# View actual resource requests/limits for all pods
kubectl get pods -n <ns> -o custom-columns='POD:.metadata.name,CPU_REQ:.spec.containers[*].resources.requests.cpu,CPU_LIM:.spec.containers[*].resources.limits.cpu,MEM_REQ:.spec.containers[*].resources.requests.memory,MEM_LIM:.spec.containers[*].resources.limits.memory'

# PersistentVolumeClaims status
kubectl get pvc -n <ns>
kubectl describe pvc <name> -n <ns>
```

## Exec e debug

```bash
# Shell into a running container
kubectl exec -it <pod> -n <ns> -- /bin/sh

# For distroless images (no shell), use ephemeral debug container
kubectl debug -it <pod> -n <ns> --image=busybox:1.36 --target=<container>

# Create a debug pod on a specific node
kubectl debug node/<node> -it --image=ubuntu

# Copy files from a pod
kubectl cp <ns>/<pod>:/path/to/file ./local-file
```

## Cluster Autoscaler

```bash
# Check autoscaler status
kubectl -n kube-system get configmap cluster-autoscaler-status -o yaml

# Check autoscaler logs for scaling decisions
kubectl -n kube-system logs -l app=cluster-autoscaler --tail=100 | grep -E "Scale|scale"

# Find unschedulable pods (triggers scale up)
kubectl get pods -A --field-selector=status.phase=Pending -o wide
```

## Aliases úteis

Adicione estes ao perfil do seu shell:

```bash
alias k='kubectl'
alias kgp='kubectl get pods'
alias kgpa='kubectl get pods -A'
alias kgn='kubectl get nodes -o wide'
alias kgs='kubectl get svc'
alias kd='kubectl describe'
alias kl='kubectl logs'
alias klf='kubectl logs -f'
alias kex='kubectl exec -it'
alias kctx='kubectl config use-context'
alias kns='kubectl config set-context --current --namespace'
```

## Recursos

- [kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Debug Running Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)
