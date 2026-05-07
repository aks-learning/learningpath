import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  learningPath: [
    {
      type: 'category',
      label: 'Getting started',
      link: { type: 'generated-index', slug: 'getting-started' },
      items: [
        'getting-started/what-is-kubernetes',
        'getting-started/what-is-aks',
        'getting-started/aks-automatic-vs-standard',
      ],
    },
    {
      type: 'category',
      label: 'Cluster setup',
      link: { type: 'generated-index', slug: 'cluster-setup' },
      items: [
        'cluster-setup/tooling',
        'cluster-setup/cluster-design',
      ],
    },
    {
      type: 'category',
      label: 'Networking',
      link: { type: 'generated-index', slug: 'networking' },
      items: [
        'networking/concepts',
        'networking/cni-comparison',
        'networking/ingress',
        'networking/ingress-comparison',
        'networking/service-mesh',
        'networking/private-clusters',
      ],
    },
    {
      type: 'category',
      label: 'Security',
      link: { type: 'generated-index', slug: 'security' },
      items: [
        'security/identity',
        'security/workload-identity',
        'security/network-security',
        'security/pod-security',
        'security/secrets-management',
      ],
    },
    {
      type: 'category',
      label: 'Observability',
      link: { type: 'generated-index', slug: 'observability' },
      items: [
        'observability/azure-monitor',
        'observability/prometheus-grafana',
        'observability/comparison',
        'observability/cost-analysis',
      ],
    },
    {
      type: 'category',
      label: 'Scaling & performance',
      link: { type: 'generated-index', slug: 'scaling' },
      items: [
        'scaling/hpa',
        'scaling/cluster-autoscaler',
        'scaling/keda',
        'scaling/virtual-nodes',
        'scaling/scaling-decision-tree',
      ],
    },
    {
      type: 'category',
      label: 'Storage',
      link: { type: 'generated-index', slug: 'storage' },
      items: [
        'storage/concepts',
        'storage/azure-disks-files',
        'storage/container-storage',
      ],
    },
    {
      type: 'category',
      label: 'Deployments & GitOps',
      link: { type: 'generated-index', slug: 'deployments' },
      items: [
        'deployments/cicd-overview',
        'deployments/gitops',
        'deployments/deployment-strategies',
      ],
    },
    {
      type: 'category',
      label: 'AI/ML workloads',
      link: { type: 'generated-index', slug: 'ai-workloads' },
      items: [
        'ai-workloads/gpu-node-pools',
        'ai-workloads/kaito',
        'ai-workloads/inference-serving',
      ],
    },
    {
      type: 'category',
      label: 'Operations & enterprise',
      link: { type: 'generated-index', slug: 'operations' },
      items: [
        'operations/upgrades-maintenance',
        'operations/backup-dr',
        'operations/fleet-manager',
        'operations/reliability',
      ],
    },
    {
      type: 'category',
      label: 'Best practices',
      link: { type: 'generated-index', slug: 'best-practices' },
      items: [
        'best-practices/architecture',
        'best-practices/cost-optimization',
        'best-practices/security-hardening',
        'best-practices/support-policy',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      link: { type: 'generated-index', slug: 'guides' },
      items: [
        'guides/sre-on-call',
        'guides/developer-workflow',
      ],
    },
    {
      type: 'category',
      label: 'Cheat sheets',
      link: { type: 'generated-index', slug: 'cheat-sheets' },
      items: [
        'cheat-sheets/kubectl',
        'cheat-sheets/az-aks',
      ],
    },
    {
      type: 'category',
      label: 'Troubleshooting',
      link: { type: 'generated-index', slug: 'troubleshooting' },
      items: [
        'troubleshooting/pod-issues',
        'troubleshooting/workload-identity',
        'troubleshooting/networking',
      ],
    },
  ],
};

export default sidebars;
