---
sidebar_position: 1
title: "O que e Kubernetes?"
description: "Quando voce realmente precisa de Kubernetes, quando nao precisa, e por que Kubernetes gerenciado e a unica escolha sensata para a maioria dos times."
---

# O que e Kubernetes?

Kubernetes (K8s) e uma plataforma de orquestracao de containers. Ele pega suas aplicacoes containerizadas e as executa em um cluster de maquinas com self-healing, escalabilidade, rolling deployments e service discovery integrados.

Mas a pergunta real e: **voce realmente precisa disso?**

## Voce Precisa de Kubernetes Quando...

- Voce tem **5+ microservicos** que precisam se comunicar, escalar independentemente e fazer deploy em cadencias diferentes
- Voce precisa de **rolling deployments com zero downtime** como requisito obrigatorio
- Seu trafego e **imprevisivel ou com picos** e voce precisa de autoscaling horizontal que reage em segundos, nao minutos
- Voce tem **multiplos times** responsaveis por servicos e precisa de isolamento por namespace, RBAC e resource quotas
- Voce esta rodando **workloads stateful** (bancos de dados, filas, treinamento de ML) junto com stateless na mesma infraestrutura
- Voce precisa de **infraestrutura portavel** entre clouds ou ambientes hibridos

## Voce NAO Precisa de Kubernetes Quando...

:::warning Pare. Pense antes de adotar Kubernetes.

O erro numero um de iniciantes e adotar Kubernetes para uma aplicacao com 2 servicos que rodaria perfeitamente no Azure Container Apps ou ate no App Service. Kubernetes adiciona complexidade operacional. Se voce nao precisa do que ele oferece, so vai te atrasar.
:::

- Voce tem **1-3 servicos** com trafego previsivel -- use Azure Container Apps
- Voce esta construindo um **monolito** ou uma API simples -- use App Service
- Voce quer **zero gerenciamento de infraestrutura** -- use Azure Container Apps com scale-to-zero
- Seu time **nao tem experiencia com containers** e nao tem tempo para aprender -- comece com Container Apps, migre para AKS depois
- Voce precisa de **serverless orientado a eventos** com cold starts abaixo de um segundo -- use Azure Functions

## O Caminho: De Containers a Orquestracao

Veja como a progressao funciona no mundo real:

1. **Voce containeriza sua aplicacao** -- Docker te da builds reproduziveis e ambientes consistentes
2. **Voce precisa rodar multiplos containers** -- Docker Compose funciona em uma maquina, mas producao precisa de resiliencia
3. **Voce precisa de orquestracao** -- Algo precisa decidir qual maquina roda qual container, reiniciar falhas, rotear trafego e gerenciar secrets
4. **Voce escolhe um orquestrador** -- Kubernetes venceu a guerra de orquestracao. Todo o resto (Docker Swarm, Mesos, Nomad) e nicho ou morreu

```yaml
# This is a Kubernetes Deployment. It tells K8s:
# "Run 3 copies of my app, restart them if they crash,
#  and roll out new versions with zero downtime."
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-api
  template:
    metadata:
      labels:
        app: my-api
    spec:
      containers:
      - name: my-api
        image: myregistry.azurecr.io/my-api:v1.2.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "250m"
            memory: "256Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
```

## Conceitos Fundamentais que Voce Precisa Conhecer

| Conceito | O que Faz | Por que Importa |
|----------|-----------|-----------------|
| **Pod** | Menor unidade. Um ou mais containers compartilhando rede/armazenamento. | Voce quase nunca cria Pods diretamente. Use Deployments. |
| **Deployment** | Gerencia replicas e rolling updates. | Esse e o feijao com arroz. Todo servico stateless e um Deployment. |
| **Service** | Nome DNS interno estavel e load balancer para Pods. | Pods sao efemeros. Services dao a eles um endereco permanente. |
| **Ingress** | Roteamento HTTP/HTTPS externo para dentro do cluster. | Sem isso, nada fora do cluster consegue acessar suas aplicacoes. |
| **Namespace** | Limite de isolamento logico. | Use um por time ou por ambiente (dev/staging/prod). |
| **ConfigMap** | Dados de configuracao nao-sensiveis. | Desacopla configuracao das imagens de container. Mude a configuracao sem refazer o deploy. |
| **Secret** | Dados sensiveis (senhas, chaves, certificados). | Nunca coloque secrets nas imagens. Sempre use Secrets ou cofres externos. |
| **PersistentVolumeClaim** | Requisicao de armazenamento duravel. | Necessario para bancos de dados, armazenamento de arquivos, qualquer coisa que sobreviva a reinicializacoes de Pod. |
| **HorizontalPodAutoscaler** | Escala replicas de Pod baseado em metricas. | Sem isso, voce esta ou superdimensionado ou prestes a cair. |

## Por que Kubernetes Gerenciado (Nao Auto-Gerenciado)

:::tip Recomendacao forte

Nao rode Kubernetes auto-gerenciado a menos que voce tenha um time de plataforma dedicado com 3+ engenheiros. Kubernetes auto-gerenciado significa que voce e responsavel por: backup/restore do etcd, upgrades do control plane, rotacao de certificados, disponibilidade do API server e cada patch de CVE. Isso e um trabalho de tempo integral para multiplas pessoas.
:::

**Use um servico gerenciado como AKS.** Veja por que:

| Aspecto | Auto-Gerenciado | AKS (Gerenciado) |
|---------|----------------|-------------------|
| Disponibilidade do control plane | Problema seu (quorum do etcd, HA do API server) | SLA da Microsoft (99.95% com tier Standard) |
| Upgrades do Kubernetes | Manual, arriscado, processo de varias horas | Um comando ou canais totalmente automatizados |
| Patches de seguranca | Voce rastreia CVEs e aplica patches | Auto-upgrade de imagem de node disponivel |
| Gerenciamento de certificados | Voce rotaciona certificados antes do vencimento | Tratado automaticamente |
| Custo do control plane | Voce paga por essas VMs | Gratuito. Voce paga zero pelo control plane. |
| Rede | Voce configura CNI, load balancers, DNS | Integracao nativa com Azure pronta para uso |

As unicas razoes legitimas para auto-gerenciar:

- Ambientes isolados (air-gapped) sem conectividade com a cloud
- Hardware exotico (edge, bare metal, GPUs especializadas nao disponiveis na cloud)
- Requisitos regulatorios que literalmente proibem servicos gerenciados (raro)

## Tabela de Decisao: Kubernetes vs. Alternativas

| Cenario | Recomendacao | Por que |
|---------|-------------|---------|
| 1-3 servicos stateless, trafego previsivel | **Azure Container Apps** | Mais simples, mais barato, scale-to-zero, sem necessidade de conhecer K8s |
| 5+ servicos, multiplos times, rede complexa | **AKS** | Voce precisa do poder de orquestracao |
| Orientado a eventos, workloads esporadicos | **Azure Functions** | Feito para isso, escalabilidade abaixo de um segundo |
| Monolito ou web app simples | **App Service** | Plataforma gerenciada, sem necessidade de containers |
| Pipelines de treinamento de ML | **AKS com GPU node pools** | Agendamento de GPU no K8s e maduro e bem suportado |
| Mandato hibrido/multi-cloud | **AKS + Azure Arc** | K8s consistente entre ambientes |

## A Curva de Aprendizado: No que Focar Primeiro

Kubernetes tem uma superficie de API enorme. Nao tente aprender tudo de uma vez. Aqui esta a ordem que importa:

1. **Semana 1**: Pods, Deployments, Services. Coloque uma aplicacao rodando e acessivel.
2. **Semana 2**: ConfigMaps, Secrets, resource requests/limits. Torne sua aplicacao configuravel e estavel.
3. **Semana 3**: Namespaces, RBAC, Ingress. Isole workloads e exponha-os corretamente.
4. **Semana 4**: HPA, PersistentVolumeClaims, health probes. Torne sua aplicacao resiliente e escalavel.
5. **Depois disso**: StatefulSets, DaemonSets, CRDs, Operators, service mesh -- somente quando voce precisar.

:::warning O que NAO aprender cedo

Nao comece com Helm charts, Operators ou service meshes. Esses sao padroes avancados que resolvem problemas que voce ainda nao tem. Aprenda os primitivos primeiro. Se voce nao consegue fazer deploy de uma aplicacao com YAML puro, voce nao deveria estar abstraindo com Helm.
:::

## Erros Comuns de Iniciantes

| Erro | Consequencia | Correcao |
|------|-------------|----------|
| Sem resource requests/limits | Pods sao agendados em qualquer lugar, OOMKilled aleatoriamente | Sempre defina `requests`. Defina `limits` para memoria. |
| Sem liveness/readiness probes | K8s nao consegue saber se sua aplicacao esta saudavel, envia trafego para Pods quebrados | Adicione probes desde o primeiro dia. Ate um simples check TCP. |
| Usar tag de imagem `latest` | Voce nao sabe qual versao esta rodando, rollbacks sao impossiveis | Sempre use tags de versao especificas (`:v1.2.3`). |
| Armazenar estado em disco local | Reinicializacoes de Pod perdem todos os dados | Use PersistentVolumeClaims para qualquer dado que precise sobreviver a reinicializacoes. |
| Um unico namespace gigante | Sem isolamento, RBAC e tudo-ou-nada, resource quotas impossiveis | Um namespace por time ou por limite de servico. |
| Ignorar Pod disruption budgets | Upgrades do cluster derrubam todas as replicas simultaneamente | Defina PDBs para que pelo menos N-1 replicas fiquem rodando durante manutencao. |

## Recursos

- [O que e Kubernetes? (Azure)](https://azure.microsoft.com/en-us/resources/cloud-computing-dictionary/what-is-kubernetes/)
- [Conceitos do Kubernetes (Documentacao Oficial)](https://kubernetes.io/docs/concepts/)
- [Arquitetura de Componentes do Kubernetes](https://kubernetes.io/docs/concepts/overview/components/)
- [Azure Container Apps vs AKS](https://learn.microsoft.com/en-us/azure/container-apps/compare-options)
- [Kubernetes the Hard Way (aprenda do que o gerenciado te livra)](https://github.com/kelseyhightower/kubernetes-the-hard-way)
- [AKS Labs -- Aprendizado Pratico](https://azure-samples.github.io/aks-labs/)

---

**Proximo**: [O que e AKS?](./what-is-aks) -- onde nos aprofundamos na oferta de Kubernetes gerenciado do Azure.
