---
sidebar_position: 4
title: "Segurança de Pod"
description: "Aplique Pod Security Standards com PSA e Azure Policy para prevenir containers privilegiados e configurações inseguras."
---

# Segurança de pod

Aplique o perfil de segurança Restricted em namespaces de produção. Sem exceções sem aprovação documentada e assinada por um líder de segurança. Um único container privilegiado é tudo o que um atacante precisa para escapar para o node e dominar seu cluster.

## Pod security standards (PSS)

O Kubernetes define três perfis de segurança. Apenas um é aceitável para produção:

| Perfil | O Que Permite | Quando Usar |
|--------|---------------|-------------|
| Privileged | Tudo. Sem restrições. | Apenas namespaces de sistema (kube-system). Nunca para workloads de aplicação. |
| Baseline | Bloqueia escalações de privilégio conhecidas, mas permite algumas configs arriscadas | Ambientes de desenvolvimento como barra mínima |
| Restricted | Bloqueia todas as configurações perigosas. Non-root, sem capabilities, root somente leitura. | Produção. Sempre. |

:::warning

Pod Security Policies (PSP) foram removidas no Kubernetes 1.25. Se você está executando qualquer coisa que referencia PSP, não está fazendo nada. Você deve migrar para Pod Security Admission (PSA).
:::

## Pod security admission (PSA)

PSA é nativo do Kubernetes. Nenhum addon necessário. Aplique por namespace com labels:

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

Para uma estratégia de rollout, comece com warn/audit e mude para enforce após corrigir as violações:

```yaml
# Phase 1: See what breaks
labels:
  pod-security.kubernetes.io/audit: restricted
  pod-security.kubernetes.io/warn: restricted

# Phase 2: After fixing violations
labels:
  pod-security.kubernetes.io/enforce: restricted
```

## O que o restricted realmente exige

A spec do seu pod deve estar em conformidade com estas regras. Sem negociação:

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
- `runAsNonRoot: true` -- o processo do container não pode executar como UID 0
- `allowPrivilegeEscalation: false` -- sem binários setuid/setgid
- `readOnlyRootFilesystem: true` -- o container não pode escrever no seu filesystem (use emptyDir para arquivos temporários)
- `capabilities.drop: ALL` -- nenhuma capability do Linux
- `seccompProfile: RuntimeDefault` -- chamadas de sistema são filtradas

## Azure Policy: cinto e suspensórios

PSA aplica no nível da API do Kubernetes. Azure Policy aplica no nível do recurso Azure. Use ambos.

```bash
# Assign the built-in "Kubernetes cluster pods should only use allowed capabilities" initiative
az policy assignment create \
  --name "aks-pod-security-restricted" \
  --policy-set-definition "42b8ef37-b724-4e24-bbc8-7a7708edfe00" \
  --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.ContainerService/managedClusters/<cluster>" \
  --params '{"effect": {"value": "deny"}}'
```

:::tip

Use Azure Policy e PSA juntos. PSA captura violações no momento da criação do pod dentro do cluster. Azure Policy captura violações através do control plane do Azure e fornece relatórios de conformidade. Eles se complementam -- um não substitui o outro.
:::

Iniciativas de Azure Policy nativas para segurança de pod no AKS:
- `Kubernetes cluster should not allow privileged containers`
- `Kubernetes cluster containers should only use allowed capabilities`
- `Kubernetes cluster pods should only use approved host network and port range`
- `Kubernetes cluster containers should run with a read only root file system`

## Lidando com exceções

Alguns workloads genuinamente precisam de permissões elevadas (agentes de monitoramento, plugins CNI, coletores de log). Trate-os adequadamente:

1. Mantenha-os em namespaces dedicados (`kube-system`, `monitoring`)
2. Aplique PSA Baseline ou Privileged apenas a esses namespaces específicos
3. Documente por que cada exceção existe
4. Revise as exceções trimestralmente -- muitos privilégios "necessários" foram precisos uma vez e esquecidos

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

Isso aplica baseline (bloqueia os piores ofensores) enquanto audita contra restricted (mostra o que falharia se você apertasse mais).

## Erros comuns

1. **Não definir seccompProfile** -- Sem seccomp significa chamadas de sistema irrestritas. Sempre defina `RuntimeDefault` no mínimo.
2. **Esquecer readOnlyRootFilesystem** -- Aplicações que escrevem no filesystem do container (logs, arquivos temporários) quebram. Corrija a aplicação para escrever em volumes montados.
3. **Executar como root "porque a imagem exige"** -- Corrija o Dockerfile. Adicione `USER 1000`. A maioria das imagens base funciona perfeitamente como non-root.
4. **Aplicar Privileged a todos os namespaces "para evitar quebrar coisas"** -- Isso desabilita toda a segurança. Comece com audit/warn, corrija as violações, depois aplique enforce.
5. **Ignorar resultados de audit do Azure Policy** -- Recursos não conformes geram alertas. Se você nunca olha para eles, você não tem visibilidade da sua postura de segurança.

## Recursos

- [Pod Security Admission in AKS](https://learn.microsoft.com/en-us/azure/aks/use-psa)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Azure Policy Built-in for AKS](https://learn.microsoft.com/en-us/azure/aks/policy-reference)
- [Kubernetes Seccomp Profiles](https://kubernetes.io/docs/tutorials/security/seccomp/)
