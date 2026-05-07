---
sidebar_position: 1
title: "Solução de problemas de pods"
description: "Árvores de decisão para as falhas de pod mais comuns: Pending, CrashLoopBackOff, ImagePullBackOff, OOMKilled e stuck terminating."
---

# Solução de problemas de pods

Seu pod não está rodando. Esta página explica o porquê e o que fazer. Comece com o status que você vê no `kubectl get pods`, siga a árvore de decisão e corrija o problema.

## Comece aqui

```bash
kubectl get pods -n <namespace> -o wide
kubectl describe pod <pod-name> -n <namespace>
```

A saída do `describe` tem a resposta 95% das vezes. Olhe a seção **Events** no final.

---

## Pending

O pod existe, mas nenhum nó o aceita.

### Árvore de decisão

**1. Verifique eventos de falhas de agendamento:**
```bash
kubectl describe pod <pod> -n <ns> | grep -A 5 "Events:"
```

**2. O que o evento diz?**

| Mensagem do evento | Causa | Correção |
|---|---|---|
| `Insufficient cpu` ou `Insufficient memory` | O nó não tem espaço para as solicitações de recursos do pod | Reduza os requests, adicione nós ou aumente o max-count no autoscaler |
| `0/N nodes are available: N node(s) had taint` | O pod não tolera os taints do nó | Adicione a toleration correta ao spec do pod |
| `0/N nodes are available: N node(s) didn't match Pod's node affinity/selector` | Node affinity ou nodeSelector não corresponde a nenhum nó | Corrija o label selector ou adicione um node pool com labels correspondentes |
| `persistentvolumeclaim "X" not found` | O PVC não existe ou está em um namespace diferente | Crie o PVC no namespace correto |
| `0/N nodes are available: N pod has unbound immediate PersistentVolumeClaims` | O PV não pode ser provisionado | Verifique se a StorageClass existe, quota de disco, incompatibilidade de zona |
| `Too many pods` | O nó atingiu o limite máximo de pods (padrão 110 no kubenet, 250 no Azure CNI Overlay) | Use menos pods por nó ou adicione nós |

**3. Cluster Autoscaler não está escalando?**
```bash
kubectl -n kube-system get configmap cluster-autoscaler-status -o yaml
kubectl -n kube-system logs -l app=cluster-autoscaler --tail=50
```

Razões comuns: max-count atingido, pod tem um nodeSelector que nenhum pool satisfaz, pod solicita mais recursos do que qualquer SKU de VM pode fornecer.

:::tip

Se um pod está Pending e o autoscaler não está respondendo, verifique se o pod tem regras de `nodeSelector` ou `affinity` que correspondem a um node pool com `min-count: 0` e `max-count: 0`. O autoscaler não pode criar nós em um pool com max-count 0.
:::

---

## CrashLoopBackOff

O contêiner inicia, roda por alguns segundos e depois termina. O Kubernetes o reinicia com backoff exponencial (10s, 20s, 40s, até 5 min).

### Árvore de decisão

**1. Obtenha os logs da última falha:**
```bash
kubectl logs <pod> -n <ns> --previous
```

**2. Verifique o exit code:**
```bash
kubectl describe pod <pod> -n <ns> | grep -A 3 "Last State"
```

| Exit code | Significado | Causa mais comum |
|-----------|-------------|------------------|
| 0 | Saída normal | A aplicação completou e encerrou. Se for um servidor web, ele não deveria encerrar. Verifique o entrypoint. |
| 1 | Erro na aplicação | Exceção não tratada, arquivo de configuração ausente, URL de banco de dados incorreta |
| 127 | Comando não encontrado | `command` ou `args` incorretos no spec do contêiner. O binário não existe na imagem. |
| 137 | OOMKilled (SIGKILL) | O contêiner excedeu seu limite de memória. Veja a seção OOMKilled abaixo. |
| 139 | Segfault (SIGSEGV) | Bug na aplicação. Verifique core dumps. |
| 143 | SIGTERM | Sinal de encerramento gracioso. Se o contêiner reiniciar após isto, verifique o liveness probe. |

**3. Correções comuns:**

- **Variável de ambiente ou secret ausente**: Verifique `kubectl describe pod` para eventos `CreateContainerConfigError`. Confirme que todos os secrets e configmaps referenciados existem.
- **Liveness probe falhando**: O probe mata um contêiner saudável mas lento. Aumente `initialDelaySeconds` e `periodSeconds`.
- **A aplicação precisa de tempo para iniciar**: Adicione um `startupProbe` com timeout generoso antes que o liveness probe entre em ação.

```yaml
startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
  # Gives the app 300 seconds (5 min) to start
```

:::warning

Não "corrija" CrashLoopBackOff removendo o liveness probe. O probe está dizendo que a aplicação está com problemas. Corrija a aplicação.
:::

---

## ImagePullBackOff

O Kubernetes não consegue baixar a imagem do contêiner.

### Árvore de decisão

**1. Verifique o erro exato:**
```bash
kubectl describe pod <pod> -n <ns> | grep -A 3 "Failed"
```

| Mensagem de erro | Causa | Correção |
|---|---|---|
| `repository does not exist or may require authorization` | Nome da imagem incorreto ou registro privado sem autenticação | Verifique o nome da imagem, vincule o ACR com `az aks update --attach-acr` |
| `unauthorized: authentication required` | Credenciais do registro ausentes ou expiradas | Para ACR, use `az aks check-acr`. Para Docker Hub, crie um `imagePullSecret` |
| `manifest unknown` | A tag não existe no registro | Verifique as tags disponíveis com `az acr repository show-tags --name myACR --repository myapp` |
| `ErrImagePull` seguido de `Back-off` | Problema de rede transitório ou rate limit | Aguarde e tente novamente. O Docker Hub limita pulls anônimos a 100/6h. Use ACR. |

**2. Verificações específicas do ACR:**
```bash
# Verify ACR is attached
az aks check-acr --resource-group myRG --name myAKS --acr myACR.azurecr.io

# If not attached
az aks update --resource-group myRG --name myAKS --attach-acr myACR

# Verify the image exists
az acr repository show-tags --name myACR --repository myapp -o tsv
```

**3. Usando imagePullSecrets (registros não-ACR):**
```bash
kubectl create secret docker-registry my-reg-cred \
  --docker-server=registry.example.com \
  --docker-username=user \
  --docker-password=pass \
  -n <namespace>
```

Depois referencie no spec do pod:
```yaml
spec:
  imagePullSecrets:
  - name: my-reg-cred
```

---

## OOMKilled

O contêiner usou mais memória do que o limite permite. O kernel o mata com sinal 137.

### Árvore de decisão

**1. Confirme que é OOMKilled:**
```bash
kubectl describe pod <pod> -n <ns> | grep -E "OOMKilled|Exit Code: 137"
```

**2. Verifique o uso atual de memória vs. limite:**
```bash
kubectl top pod <pod> -n <ns> --containers
```

**3. Decida a correção:**

| Situação | Correção |
|---|---|
| A aplicação genuinamente precisa de mais memória | Aumente `resources.limits.memory`. Mas também investigue se há um vazamento. |
| O limite de memória está muito baixo | Defina o limite para 1,5-2x do uso típico. Use o VPA em modo de recomendação para encontrar o valor correto. |
| Vazamento de memória (uso cresce ao longo do tempo) | Corrija a aplicação. Causas comuns: caches sem limite, vazamento de pool de conexões, processamento de arquivos grandes sem streaming. |
| Aplicação JVM terminada apesar de `-Xmx` configurado | A JVM usa mais memória do que apenas o heap (thread stacks, metaspace, native buffers). Defina o limite para `Xmx + 500Mi` no mínimo. |

**4. Use VPA para recomendações de dimensionamento:**
```bash
# Install VPA and set it to recommendation-only mode
# Then check recommendations
kubectl get vpa -n <ns> -o yaml
```

:::tip

Nunca defina limites de memória iguais aos requests para aplicações JVM ou .NET. Esses runtimes precisam de espaço adicional acima do heap para GC, JIT e thread stacks. Um bom ponto de partida: `requests = uso típico`, `limits = requests * 2`.
:::

---

## CreateContainerConfigError

O contêiner não pode iniciar porque um recurso referenciado está ausente.

### Causas comuns

```bash
kubectl describe pod <pod> -n <ns> | grep -A 5 "Warning"
```

| Erro | Correção |
|---|---|
| `secret "X" not found` | Crie o secret no namespace correto |
| `configmap "X" not found` | Crie o configmap no namespace correto |
| `key "Y" not found in secret "X"` | O secret existe mas está sem a chave esperada. Verifique `kubectl get secret X -n <ns> -o jsonpath='{.data}'` |
| `projected volume mount failed` | Problema de volume de token do Workload Identity. Verifique o OIDC issuer e as annotations do service account. |

---

## Stuck terminating

Um pod está travado no estado `Terminating` e não desaparece.

### Árvore de decisão

**1. Verifique finalizers:**
```bash
kubectl get pod <pod> -n <ns> -o jsonpath='{.metadata.finalizers}'
```

Se finalizers estão presentes, algo está esperando para fazer a limpeza. Removê-los à força pode causar vazamento de recursos.

**2. Verifique se o PDB está bloqueando a remoção:**
```bash
kubectl get pdb -n <ns>
```

Se o PDB impede a disrupção do último pod restante, a operação de drain fica bloqueada.

**3. Exclusão forçada (último recurso):**
```bash
kubectl delete pod <pod> -n <ns> --grace-period=0 --force
```

:::warning

Excluir à força um pod com PersistentVolume anexado pode fazer com que o volume permaneça anexado ao nó antigo. O pod substituto não consegue montá-lo. Use a exclusão forçada apenas quando tiver certeza de que não há dependências de volume.
:::

---

## Script de diagnóstico rápido

Execute isto quando precisar de uma visão geral rápida de todos os problemas em um namespace:

```bash
NS=my-namespace

echo "=== Non-running pods ==="
kubectl get pods -n $NS --field-selector=status.phase!=Running,status.phase!=Succeeded

echo "=== Warning events (last 1h) ==="
kubectl get events -n $NS --field-selector type=Warning --sort-by='.lastTimestamp' | tail -20

echo "=== Resource pressure ==="
kubectl top pods -n $NS --sort-by=memory | head -10

echo "=== PVC status ==="
kubectl get pvc -n $NS | grep -v Bound
```

## Recursos

- [Debug Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/)
- [Debug Running Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)
- [Solução de problemas de clusters AKS](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/troubleshoot-aks-cluster-creation-issues)
