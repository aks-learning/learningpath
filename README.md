# AKS Learning Path

**From zero to production on Azure Kubernetes Service.**

A comprehensive, opinionated learning resource for Azure Kubernetes Service (AKS). This site provides production-ready guidance, decision frameworks, and hands-on references — not just documentation links, but real recommendations on what to use and why.

**Live site**: [https://aks-learning.github.io](https://aks-learning.github.io)

---

## What You'll Find

| Topic | Description |
|-------|-------------|
| **Getting Started** | What is AKS, AKS Automatic vs Standard, first deployment |
| **Cluster Setup** | Cluster design decisions, tooling (Terraform, Bicep, CLI) |
| **Networking** | CNI comparison, ingress (AGC, NGINX), private clusters, service mesh |
| **Security** | Workload Identity, pod security, secrets management, network policies |
| **Observability** | Azure Monitor, Prometheus + Grafana, cost analysis |
| **Scaling** | HPA, Cluster Autoscaler, KEDA, Virtual Nodes |
| **Storage** | Azure Disks, Azure Files, Azure Container Storage |
| **Deployments** | CI/CD pipelines, GitOps with Flux, deployment strategies |
| **AI Workloads** | GPU node pools, KAITO, inference serving |
| **Operations** | Upgrades, backup/DR, reliability, Fleet Manager |
| **Best Practices** | Architecture patterns, cost optimization, security hardening |

## Opinionated by Design

This is not a neutral documentation site. Every page takes a clear stance:

- **"Use Azure CNI Overlay with Cilium. Not kubenet."**
- **"Use Workload Identity. Pod Identity is deprecated."**
- **"Use AKS Automatic for new clusters unless you need specific control."**

Each recommendation includes the reasoning, the alternatives, and when you might choose differently.

## Ecosystem

This site is part of the broader AKS learning ecosystem:

- [AKS Labs](https://azure-samples.github.io/aks-labs) — Hands-on workshops and guided labs
- [AKS Blog](https://blog.aks.azure.com/) — Official AKS team blog with announcements and deep dives
- [AKS Newsletter](https://aksnewsletter.com) — Weekly curated AKS news and updates
- [AKS Documentation](https://learn.microsoft.com/en-us/azure/aks/) — Official Microsoft documentation

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm

### Setup

```bash
npm install
```

### Run locally

```bash
npm start
```

Opens a local dev server at `http://localhost:3000`. Changes are reflected live.

### Build

```bash
npm run build
```

Generates static files in the `build/` directory.

## Tech Stack

- **[Docusaurus 3](https://docusaurus.io/)** — Static site generator
- **GitHub Pages** — Hosting via GitHub Actions
- **Custom SVG diagrams** — Architecture diagrams, decision trees, workflow visualizations
- **MDX** — Markdown with React components

## Contributing

Contributions are welcome! Whether it's fixing a typo, adding a new topic, or improving existing content:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-improvement`)
3. Make your changes
4. Run `npm run build` to verify the build passes
5. Submit a Pull Request

### Content Guidelines

- **Be opinionated** — Take a stance, explain why, note exceptions
- **Be practical** — Include CLI commands, YAML examples, real-world scenarios
- **Link to official docs** — Reference Microsoft Learn for deep dives
- **No emojis** — Keep the tone professional

## License

This project is open source and community-driven.
