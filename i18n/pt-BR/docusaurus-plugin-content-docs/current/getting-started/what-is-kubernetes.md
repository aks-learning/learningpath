---
sidebar_position: 1
title: "O que é Kubernetes?"
description: "Quando você realmente precisa de Kubernetes, quando não precisa, e por que Kubernetes gerenciado é a única escolha sensata para a maioria dos times."
---

# O que é Kubernetes?

Kubernetes (K8s) é uma plataforma de orquestração de containers. Ele pega suas aplicações containerizadas e as executa em um cluster de máquinas com self-healing, escalabilidade, rolling deployments e service discovery integrados.

Mas a pergunta real é: **você realmente precisa disso?**

## Você precisa de Kubernetes quando...

- Você tem **5+ microsserviços** que precisam se comunicar, escalar independentemente e fazer deploy em cadências diferentes
- Você precisa de **rolling deployments com zero downtime** como requisito obrigatório
- Seu tráfego é **imprevisível ou com picos** e você precisa de autoscaling horizontal que reage em segundos, não minutos
- Você tem **múltiplos times** responsáveis por serviços e precisa de isolamento por namespace, RBAC e resource quotas
- Você está rodando **workloads stateful** (bancos de dados, filas, treinamento de ML) junto com stateless na mesma infraestrutura
- Você precisa de **infraestrutura portável** entre clouds ou ambientes híbridos

## Você NAO precisa de Kubernetes quando...

:::warning Pare. Pense antes de adotar Kubernetes.

O erro número um de iniciantes é adotar Kubernetes para uma aplicação com 2 serviços que rodaria perfeitamente no Azure Container Apps ou até no App Service. Kubernetes adiciona complexidade operacional. Se você não precisa do que ele oferece, só vai te atrasar.
:::

- Você tem **1-3 serviços** com tráfego previsível -- use Azure Container Apps
- Você está construindo um **monolito** ou uma API simples -- use App Service
- Você quer **zero gerenciamento de infraestrutura** -- use Azure Container Apps com scale-to-zero
- Seu time **não tem experiência com containers** e não tem tempo para aprender -- comece com Container Apps, migre para AKS depois
- Você precisa de **serverless orientado a eventos** com cold starts abaixo de um segundo -- use Azure Functions

## O caminho: de containers a orquestração

Veja como a progressão funciona no mundo real:

1. **Você containeriza sua aplicação** -- Docker te dá builds reproduzíveis e ambientes consistentes
2. **Você precisa rodar múltiplos containers** -- Docker Compose funciona em uma máquina, mas produção precisa de resiliência
3. **Você precisa de orquestração** -- Algo precisa decidir qual máquina roda qual container, reiniciar falhas, rotear tráfego e gerenciar secrets
4. **Você escolhe um orquestrador** -- Kubernetes venceu a guerra de orquestração. Todo o resto (Docker Swarm, Mesos, Nomad) é nicho ou morreu

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

## Conceitos fundamentais que você precisa conhecer

| Conceito | O que Faz | Por que Importa |
|----------|-----------|-----------------|
| **Pod** | Menor unidade. Um ou mais containers compartilhando rede/armazenamento. | Você quase nunca cria Pods diretamente. Use Deployments. |
| **Deployment** | Gerencia réplicas e rolling updates. | Esse é o feijão com arroz. Todo serviço stateless é um Deployment. |
| **Service** | Nome DNS interno estável e load balancer para Pods. | Pods são efêmeros. Services dão a eles um endereço permanente. |
| **Ingress** | Roteamento HTTP/HTTPS externo para dentro do cluster. | Sem isso, nada fora do cluster consegue acessar suas aplicações. |
| **Namespace** | Limite de isolamento lógico. | Use um por time ou por ambiente (dev/staging/prod). |
| **ConfigMap** | Dados de configuração não-sensíveis. | Desacopla configuração das imagens de container. Mude a configuração sem refazer o deploy. |
| **Secret** | Dados sensíveis (senhas, chaves, certificados). | Nunca coloque secrets nas imagens. Sempre use Secrets ou cofres externos. |
| **PersistentVolumeClaim** | Requisição de armazenamento durável. | Necessário para bancos de dados, armazenamento de arquivos, qualquer coisa que sobreviva a reinicializações de Pod. |
| **HorizontalPodAutoscaler** | Escala réplicas de Pod baseado em métricas. | Sem isso, você está ou superdimensionado ou prestes a cair. |

## Por que Kubernetes gerenciado (não auto-gerenciado)

:::tip Recomendação forte

Não rode Kubernetes auto-gerenciado a menos que você tenha um time de plataforma dedicado com 3+ engenheiros. Kubernetes auto-gerenciado significa que você é responsável por: backup/restore do etcd, upgrades do control plane, rotação de certificados, disponibilidade do API server e cada patch de CVE. Isso é um trabalho de tempo integral para múltiplas pessoas.
:::

**Use um serviço gerenciado como AKS.** Veja por que:

| Aspecto | Auto-Gerenciado | AKS (Gerenciado) |
|---------|----------------|-------------------|
| Disponibilidade do control plane | Problema seu (quorum do etcd, HA do API server) | SLA da Microsoft (99.95% com tier Standard) |
| Upgrades do Kubernetes | Manual, arriscado, processo de várias horas | Um comando ou canais totalmente automatizados |
| Patches de segurança | Você rastreia CVEs e aplica patches | Auto-upgrade de imagem de node disponível |
| Gerenciamento de certificados | Você rotaciona certificados antes do vencimento | Tratado automaticamente |
| Custo do control plane | Você paga por essas VMs | Gratuito. Você paga zero pelo control plane. |
| Rede | Você configura CNI, load balancers, DNS | Integração nativa com Azure pronta para uso |

As únicas razões legítimas para auto-gerenciar:

- Ambientes isolados (air-gapped) sem conectividade com a cloud
- Hardware exótico (edge, bare metal, GPUs especializadas não disponíveis na cloud)
- Requisitos regulatórios que literalmente proibem serviços gerenciados (raro)

## Tabela de decisão: Kubernetes vs. alternativas

| Cenário | Recomendação | Por que |
|---------|-------------|---------|
| 1-3 serviços stateless, tráfego previsível | **Azure Container Apps** | Mais simples, mais barato, scale-to-zero, sem necessidade de conhecer K8s |
| 5+ serviços, múltiplos times, rede complexa | **AKS** | Você precisa do poder de orquestração |
| Orientado a eventos, workloads esporádicos | **Azure Functions** | Feito para isso, escalabilidade abaixo de um segundo |
| Monolito ou web app simples | **App Service** | Plataforma gerenciada, sem necessidade de containers |
| Pipelines de treinamento de ML | **AKS com GPU node pools** | Agendamento de GPU no K8s é maduro e bem suportado |
| Mandato híbrido/multi-cloud | **AKS + Azure Arc** | K8s consistente entre ambientes |

## A curva de aprendizado: no que focar primeiro

Kubernetes tem uma superfície de API enorme. Não tente aprender tudo de uma vez. Aqui está a ordem que importa:

1. **Semana 1**: Pods, Deployments, Services. Coloque uma aplicação rodando e acessível.
2. **Semana 2**: ConfigMaps, Secrets, resource requests/limits. Torne sua aplicação configurável e estável.
3. **Semana 3**: Namespaces, RBAC, Ingress. Isole workloads e exponha-os corretamente.
4. **Semana 4**: HPA, PersistentVolumeClaims, health probes. Torne sua aplicação resiliente e escalável.
5. **Depois disso**: StatefulSets, DaemonSets, CRDs, Operators, service mesh -- somente quando você precisar.

:::warning O que NÃO aprender cedo

Não comece com Helm charts, Operators ou service meshes. Esses são padrões avançados que resolvem problemas que você ainda não tem. Aprenda os primitivos primeiro. Se você não consegue fazer deploy de uma aplicação com YAML puro, você não deveria estar abstraindo com Helm.
:::

## Erros comuns de iniciantes

| Erro | Consequência | Correção |
|------|-------------|----------|
| Sem resource requests/limits | Pods são agendados em qualquer lugar, OOMKilled aleatoriamente | Sempre defina `requests`. Defina `limits` para memória. |
| Sem liveness/readiness probes | K8s não consegue saber se sua aplicação está saudável, envia tráfego para Pods quebrados | Adicione probes desde o primeiro dia. Até um simples check TCP. |
| Usar tag de imagem `latest` | Você não sabe qual versão está rodando, rollbacks são impossíveis | Sempre use tags de versão específicas (`:v1.2.3`). |
| Armazenar estado em disco local | Reinicializações de Pod perdem todos os dados | Use PersistentVolumeClaims para qualquer dado que precise sobreviver a reinicializações. |
| Um único namespace gigante | Sem isolamento, RBAC é tudo-ou-nada, resource quotas impossíveis | Um namespace por time ou por limite de serviço. |
| Ignorar Pod disruption budgets | Upgrades do cluster derrubam todas as réplicas simultaneamente | Defina PDBs para que pelo menos N-1 réplicas fiquem rodando durante manutenção. |

## Recursos

- [O que é Kubernetes? (Azure)](https://azure.microsoft.com/en-us/resources/cloud-computing-dictionary/what-is-kubernetes/)
- [Conceitos do Kubernetes (Documentação Oficial)](https://kubernetes.io/docs/concepts/)
- [Arquitetura de Componentes do Kubernetes](https://kubernetes.io/docs/concepts/overview/components/)
- [Azure Container Apps vs AKS](https://learn.microsoft.com/en-us/azure/container-apps/compare-options)
- [Kubernetes the Hard Way (aprenda do que o gerenciado te livra)](https://github.com/kelseyhightower/kubernetes-the-hard-way)
- [AKS Labs -- Aprendizado Prático](https://azure-samples.github.io/aks-labs/)

---

**Próximo**: [O que é AKS?](./what-is-aks) -- onde nos aprofundamos na oferta de Kubernetes gerenciado do Azure.
