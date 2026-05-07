---
sidebar_position: 1
title: "Guia SRE de plantão"
description: "Playbook passo a passo para lidar com incidentes no AKS: triagem inicial, padrões comuns de falha, caminhos de escalação e revisão pós-incidente."
---

# Guia SRE de plantão

Você foi acionado. Seu cluster AKS tem um problema. Este é seu playbook passo a passo para os primeiros 30 minutos.

Não comece a depurar aleatoriamente. Siga a sequência abaixo. A maioria dos incidentes no AKS se enquadra em um número pequeno de padrões, e a triagem estruturada resolve mais rápido do que a intuição.

## Primeiros 5 minutos: avalie o escopo

Antes de mexer em qualquer coisa, determine o raio de impacto. Execute estes comandos em ordem:

```bash
# 1. Can you reach the API server?
kubectl cluster-info

# 2. Are nodes healthy?
kubectl get nodes -o wide

# 3. How many pods are unhealthy?
kubectl get pods --all-namespaces --field-selector status.phase!=Running,status.phase!=Succeeded

# 4. Are there recent events signaling trouble?
kubectl get events --all-namespaces --sort-by='.lastTimestamp' | tail -30

# 5. Check system pods — if these are broken, the cluster is broken
kubectl get pods -n kube-system
```

Use a saída para classificar o incidente:

| Raio de impacto | Sintomas | Causa provável |
|---|---|---|
| Pod individual | Um pod em CrashLoopBackOff ou Error | Bug no aplicativo, configuração incorreta, secret ausente |
| Serviço individual | Todos os pods de um deployment não saudáveis | Rollout com falha, exaustão de recursos, falha no pull da imagem |
| Nó individual | Múltiplos pods em um nó falhando | Nó not ready, pressão de disco, OOM |
| Cluster inteiro | API server inacessível, todos os nós afetados | Problema no plano de controle, falha de rede, expiração de certificado |

## Triagem por sintoma

### Usuários reportando erros

Trabalhe da borda para dentro:

```bash
# 1. Check the failing pods
kubectl get pods -n <namespace> -l app=<service>
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace> --tail=100

# 2. Check the ingress controller
kubectl get pods -n ingress-nginx
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --tail=50

# 3. Check backend service endpoints
kubectl get endpoints <service-name> -n <namespace>
```

:::tip

Se `kubectl get endpoints` retorna um subconjunto vazio, o seletor do serviço não corresponde a nenhum pod em execução. Verifique incompatibilidades de labels primeiro — esta é a causa mais comum de "serviço retorna 503."

:::

### Alta latência

```bash
# 1. Check resource pressure on nodes
kubectl top nodes
kubectl top pods -n <namespace> --sort-by=cpu

# 2. Check for throttled pods
kubectl get pods -n <namespace> -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.qosClass}{"\n"}{end}'

# 3. Check node conditions
kubectl describe nodes | grep -A5 "Conditions:"

# 4. Check external dependencies (DNS resolution time, upstream APIs)
kubectl exec -it <pod-name> -n <namespace> -- nslookup <external-service>
```

:::warning

Se `kubectl top nodes` mostra CPU ou memória acima de 80 por cento em múltiplos nós, o cluster autoscaler pode estar com dificuldades para acompanhar. Verifique pods pendentes com `kubectl get pods --field-selector status.phase=Pending --all-namespaces` e revise o status do autoscaler com `kubectl describe configmap cluster-autoscaler-status -n kube-system`.

:::

### Interrupção completa

```bash
# 1. Check API server — if this fails, use Azure portal
kubectl cluster-info

# 2. Check all nodes
kubectl get nodes

# 3. Check DNS (CoreDNS)
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50

# 4. Check networking (kube-proxy, CNI)
kubectl get pods -n kube-system -l component=kube-proxy
kubectl get pods -n kube-system | grep -i azure-cni
```

Se o `kubectl` em si está inacessível, vá diretamente ao portal Azure. Verifique o **Resource Health** no recurso AKS e procure no **Activity Log** por operações recentes do plano de controle.

### Pods não sendo agendados

```bash
# 1. Check pending pods and their events
kubectl get pods --field-selector status.phase=Pending --all-namespaces
kubectl describe pod <pending-pod> -n <namespace>

# 2. Check cluster autoscaler
kubectl get events -n kube-system | grep -i "cluster-autoscaler"

# 3. Check resource quotas
kubectl get resourcequotas --all-namespaces

# 4. Check node capacity vs requests
kubectl describe nodes | grep -A10 "Allocated resources:"
```

Razões comuns para falhas de agendamento:

| Mensagem do evento | Causa | Correção |
|---|---|---|
| `Insufficient cpu` | Nós estão cheios, autoscaler no máximo | Aumente o `--max-count` no node pool ou reduza os resource requests |
| `Insufficient memory` | O mesmo que acima para memória | O mesmo que acima |
| `node(s) had taint` | Pod sem toleration | Adicione toleration ao pod spec ou use o node pool correto |
| `no persistent volumes available` | PVC não consegue vincular | Verifique se a storage class existe e se a quota não está esgotada |
| `Too many pods` | Nó no limite máximo de pods | O padrão é 30 para Azure CNI — aumente ou adicione nós |

## Padrões comuns de incidentes no AKS

### Nó not ready

```bash
# Check node status
kubectl describe node <node-name> | grep -A20 "Conditions:"

# Check kubelet logs via Azure portal or node SSH
# Common causes: disk pressure, OOM killer, kubelet crash
```

**Pressão de disco:** O disco do SO do nó está cheio. Os culpados comuns são logs de container e imagens não utilizadas. Mitigação: habilite discos de SO efêmeros no node pool para obter um disco limpo em cada reinicialização.

**OOM:** O OOM killer do kernel terminou o kubelet ou um processo do sistema. Verifique a saída do `dmesg` no nó. Mitigação: defina limites de recursos em todos os pods e use classes QoS `Burstable` ou `Guaranteed`.

### Expiração de certificado

O AKS rotaciona automaticamente os certificados do cluster, mas certificados de webhook customizados e certificados TLS de ingress são sua responsabilidade.

```bash
# Check API server certificate expiry
kubectl get nodes -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].message}'

# Check webhook certificates
kubectl get validatingwebhookconfigurations -o yaml | grep -i "caBundle"
kubectl get mutatingwebhookconfigurations -o yaml | grep -i "caBundle"

# Rotate AKS cluster certificates if expired
az aks rotate-certs --resource-group <rg> --name <cluster>
```

:::warning

`az aks rotate-certs` causa uma reinicialização gradual de todos os nós. Agende isso durante uma janela de manutenção. Leva 30 minutos ou mais para clusters grandes.

:::

### Exaustão de quota

```bash
# Check Azure subscription quotas
az vm list-usage --location <region> -o table

# Check Kubernetes resource quotas
kubectl get resourcequotas --all-namespaces

# Check PVC usage
kubectl get pvc --all-namespaces
```

### Atualização com falha

```bash
# Check upgrade status
az aks show --resource-group <rg> --name <cluster> --query "provisioningState"

# Check for stuck nodes
kubectl get nodes -o wide
kubectl get pods --all-namespaces | grep -v Running | grep -v Completed

# Check PodDisruptionBudgets blocking drain
kubectl get pdb --all-namespaces
```

Uma causa comum de atualizações travadas é um PDB que não permite nenhuma interrupção. Se `minAvailable` é igual à contagem de réplicas, o nó nunca consegue ser drenado. Corrija o PDB e a atualização prosseguirá.

### Falhas de resolução DNS

```bash
# Test DNS from inside a pod
kubectl run dns-test --image=busybox:1.36 --rm -it --restart=Never -- nslookup kubernetes.default

# Check CoreDNS pods
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=100

# Check CoreDNS ConfigMap for custom entries
kubectl get configmap coredns-custom -n kube-system -o yaml
```

## Matriz de escalação

| Severidade | Critérios | Ação | Nível de suporte Azure |
|---|---|---|---|
| Sev A (Crítico) | Carga de trabalho de produção completamente fora do ar, sem solução alternativa | Abra ticket de suporte Azure imediatamente, solicite retorno de chamada | Business Critical ou Unified |
| Sev B (Alto) | Produção degradada, solução alternativa existe | Abra ticket em até 1 hora, inclua diagnósticos | Standard ou superior |
| Sev C (Médio) | Problema em não-produção ou intermitente | Abra ticket durante horário comercial | Standard |
| Sev D (Baixo) | Pergunta ou solicitação de orientação | Use Microsoft Q&A ou abra ticket consultivo | Qualquer |

**O que incluir em cada ticket de suporte:**

```text
- Subscription ID
- Resource group and cluster name
- Region
- Kubernetes version (kubectl version --short)
- Timestamp of when the issue started (UTC)
- Output of: kubectl get nodes -o wide
- Output of: kubectl get pods --all-namespaces --field-selector status.phase!=Running
- Output of: kubectl get events --sort-by='.lastTimestamp' --all-namespaces | tail -50
- Azure Activity Log entries for the cluster (last 2 hours)
- Correlation ID from any failed Azure operations
```

:::info

Execute `az aks get-credentials` antes de gerar os diagnósticos. Para clusters com AAD gerenciado, use `az aks get-credentials --admin` se seu token regular estiver expirado — você precisa de acesso `kubectl` funcional para coletar os dados acima.

:::

## Checklist pós-incidente

Complete isso em até 48 horas após cada incidente Sev A ou Sev B:

1. **Linha do tempo** — Escreva um relato minuto a minuto do que aconteceu, quando foi detectado e quando foi resolvido.
2. **Causa raiz** — Identifique a causa raiz real, não o gatilho imediato.
3. **Lacuna de detecção** — Quanto tempo entre o início do problema e o primeiro alerta? Se mais de 5 minutos, corrija o monitoramento.
4. **Passos de resolução** — Documente exatamente quais comandos foram executados para resolver o problema.
5. **Prevenção** — Identifique pelo menos um item de ação que previna recorrência. Atribua um responsável e uma data de prazo.
6. **Atualização do runbook** — Se este tipo de incidente não está coberto no runbook, adicione-o.

## Ferramentas essenciais para plantão

### Aliases do kubectl

Adicione estes ao perfil do seu shell:

```bash
alias k='kubectl'
alias kg='kubectl get'
alias kd='kubectl describe'
alias kl='kubectl logs'
alias kgp='kubectl get pods'
alias kgn='kubectl get nodes'
alias kge='kubectl get events --sort-by=".lastTimestamp"'
alias kns='kubectl config set-context --current --namespace'

# Quick health check
alias khealth='kubectl get nodes && echo "---" && kubectl get pods -A --field-selector status.phase!=Running,status.phase!=Succeeded'
```

### Recursos do portal Azure

- **Resource Health** — Mostra se o plano de controle do AKS está saudável. Vá ao recurso AKS, selecione **Diagnose and solve problems**.
- **Container Insights live logs** — Streaming de logs em tempo real sem `kubectl`. Vá ao recurso AKS, selecione **Monitoring > Logs > Live data**.
- **Activity Log** — Mostra operações recentes do plano de controle (escala, atualização, reinicialização). Filtre pelas últimas 2 horas.

### Diagnósticos via CLI

```bash
# Collect AKS diagnostics bundle
az aks kollect --resource-group <rg> --name <cluster> --storage-account <sa>

# Check AKS managed control plane health
az aks show --resource-group <rg> --name <cluster> --query "powerState"
```

## Template de runbook

Copie este template e personalize para sua equipe. Armazene-o na wiki da sua equipe ou sistema de gerenciamento de incidentes.

```markdown
# Runbook: [Incident type]

## Symptoms
- [What does the alert look like?]
- [What do users report?]

## Triage steps
1. [First command to run]
2. [Second command to run]
3. [How to confirm this is the right runbook]

## Resolution
1. [Step-by-step fix]
2. [Verification that the fix worked]

## Escalation
- If step N fails, escalate to [team/person]
- Azure support severity: [A/B/C]

## Prevention
- [What monitoring should catch this earlier]
- [What config change prevents recurrence]
```

## Recursos

- [AKS troubleshooting overview](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/welcome-azure-kubernetes)
- [AKS diagnostics overview](https://learn.microsoft.com/en-us/azure/aks/concepts-diagnostics)
- [Cluster autoscaler troubleshooting](https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler-overview)
- [CoreDNS customization in AKS](https://learn.microsoft.com/en-us/azure/aks/coredns-custom)
- [AKS certificate rotation](https://learn.microsoft.com/en-us/azure/aks/certificate-rotation)
- [Azure support plans](https://azure.microsoft.com/en-us/support/plans)
