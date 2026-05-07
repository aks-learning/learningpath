---
sidebar_position: 4
title: "Seguranca de Pod"
description: "Aplique Pod Security Standards com PSA e Azure Policy para prevenir containers privilegiados e configuracoes inseguras."
---

# Seguranca de Pod

Aplique o perfil de seguranca Restricted em namespaces de producao. Sem excecoes sem aprovacao documentada e assinada por um lider de seguranca. Um unico container privilegiado e tudo o que um atacante precisa para escapar para o node e dominar seu cluster.

## Pod Security Standards (PSS)

O Kubernetes define tres perfis de seguranca. Apenas um e aceitavel para producao:

| Perfil | O Que Permite | Quando Usar |
|--------|---------------|-------------|
| Privileged | Tudo. Sem restricoes. | Apenas namespaces de sistema (kube-system). Nunca para workloads de aplicacao. |
| Baseline | Bloqueia escalacoes de privilegio conhecidas, mas permite algumas configs arriscadas | Ambientes de desenvolvimento como barra minima |
| Restricted | Bloqueia todas as configuracoes perigosas. Non-root, sem capabilities, root somente leitura. | Producao. Sempre. |

:::warning

Pod Security Policies (PSP) foram removidas no Kubernetes 1.25. Se voce esta executando qualquer coisa que referencia PSP, nao esta fazendo nada. Voce deve migrar para Pod Security Admission (PSA).
:::

## Pod Security Admission (PSA)

PSA e nativo do Kubernetes. Nenhum addon necessario. Aplique por namespace com labels:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

Para uma estrategia de rollout, comece com warn/audit e mude para enforce apos corrigir as violacoes:

```yaml
# Phase 1: See what breaks
labels:
  pod-security.kubernetes.io/audit: restricted
  pod-security.kubernetes.io/warn: restricted

# Phase 2: After fixing violations
labels:
  pod-security.kubernetes.io/enforce: restricted
```

## O Que o Restricted Realmente Exige

A spec do seu pod deve estar em conformidade com estas regras. Sem negociacao:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
  namespace: production
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: myregistry.azurecr.io/myapp:latest
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      runAsNonRoot: true
      runAsUser: 1000
      capabilities:
        drop:
          - ALL
    volumeMounts:
    - name: tmp
      mountPath: /tmp
  volumes:
  - name: tmp
    emptyDir: {}
```

Pontos-chave:
- `runAsNonRoot: true` -- o processo do container nao pode executar como UID 0
- `allowPrivilegeEscalation: false` -- sem binarios setuid/setgid
- `readOnlyRootFilesystem: true` -- o container nao pode escrever no seu filesystem (use emptyDir para arquivos temporarios)
- `capabilities.drop: ALL` -- nenhuma capability do Linux
- `seccompProfile: RuntimeDefault` -- chamadas de sistema sao filtradas

## Azure Policy: Cinto e Suspensorios

PSA aplica no nivel da API do Kubernetes. Azure Policy aplica no nivel do recurso Azure. Use ambos.

```bash
# Assign the built-in "Kubernetes cluster pods should only use allowed capabilities" initiative
az policy assignment create \
  --name "aks-pod-security-restricted" \
  --policy-set-definition "42b8ef37-b724-4e24-bbc8-7a7708edfe00" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/<cluster>" \
  --params '{"effect": {"value": "deny"}}'
```

:::tip

Use Azure Policy e PSA juntos. PSA captura violacoes no momento da criacao do pod dentro do cluster. Azure Policy captura violacoes atraves do control plane do Azure e fornece relatorios de conformidade. Eles se complementam -- um nao substitui o outro.
:::

Iniciativas de Azure Policy nativas para seguranca de pod no AKS:
- `Kubernetes cluster should not allow privileged containers`
- `Kubernetes cluster containers should only use allowed capabilities`
- `Kubernetes cluster pods should only use approved host network and port range`
- `Kubernetes cluster containers should run with a read only root file system`

## Lidando com Excecoes

Alguns workloads genuinamente precisam de permissoes elevadas (agentes de monitoramento, plugins CNI, coletores de log). Trate-os adequadamente:

1. Mantenha-os em namespaces dedicados (`kube-system`, `monitoring`)
2. Aplique PSA Baseline ou Privileged apenas a esses namespaces especificos
3. Documente por que cada excecao existe
4. Revise as excecoes trimestralmente -- muitos privilegios "necessarios" foram precisos uma vez e esquecidos

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
  labels:
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

Isso aplica baseline (bloqueia os piores ofensores) enquanto audita contra restricted (mostra o que falharia se voce apertasse mais).

## Erros Comuns

1. **Nao definir seccompProfile** -- Sem seccomp significa chamadas de sistema irrestritas. Sempre defina `RuntimeDefault` no minimo.
2. **Esquecer readOnlyRootFilesystem** -- Aplicacoes que escrevem no filesystem do container (logs, arquivos temporarios) quebram. Corrija a aplicacao para escrever em volumes montados.
3. **Executar como root "porque a imagem exige"** -- Corrija o Dockerfile. Adicione `USER 1000`. A maioria das imagens base funciona perfeitamente como non-root.
4. **Aplicar Privileged a todos os namespaces "para evitar quebrar coisas"** -- Isso desabilita toda a seguranca. Comece com audit/warn, corrija as violacoes, depois aplique enforce.
5. **Ignorar resultados de audit do Azure Policy** -- Recursos nao conformes geram alertas. Se voce nunca olha para eles, voce nao tem visibilidade da sua postura de seguranca.

## Recursos

- [Pod Security Admission in AKS](https://learn.microsoft.com/en-us/azure/aks/use-psa)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Azure Policy Built-in for AKS](https://learn.microsoft.com/en-us/azure/aks/policy-reference)
- [Kubernetes Seccomp Profiles](https://kubernetes.io/docs/tutorials/security/seccomp/)
