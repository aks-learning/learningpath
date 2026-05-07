import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import styles from './index.module.css';

function HeroBanner() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--aks', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/getting-started/what-is-kubernetes">
            Start Learning →
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/">
            Browse Topics
          </Link>
        </div>
      </div>
    </header>
  );
}

const topics = [
  { title: 'Getting Started', description: 'Kubernetes basics & AKS intro', link: '/docs/getting-started/' },
  { title: 'Cluster Setup', description: 'Tooling, IaC & design decisions', link: '/docs/cluster-setup/' },
  { title: 'Networking', description: 'CNI, Ingress, Service Mesh', link: '/docs/networking/' },
  { title: 'Security', description: 'Identity, policies & secrets', link: '/docs/security/' },
  { title: 'Observability', description: 'Monitor, Prometheus & Grafana', link: '/docs/observability/' },
  { title: 'Scaling', description: 'HPA, KEDA & Cluster Autoscaler', link: '/docs/scaling/' },
  { title: 'Storage', description: 'Disks, Files & Container Storage', link: '/docs/storage/' },
  { title: 'Deployments & GitOps', description: 'CI/CD, Flux & Argo CD', link: '/docs/deployments/' },
  { title: 'AI/ML Workloads', description: 'GPUs, KAITO & inference', link: '/docs/ai-workloads/' },
  { title: 'Operations', description: 'Upgrades, DR & Fleet', link: '/docs/operations/' },
  { title: 'Best Practices', description: 'Architecture & cost optimization', link: '/docs/best-practices/' },
];

function TopicGrid() {
  return (
    <section className={styles.topics}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Topics</h2>
        <div className="topic-grid">
          {topics.map((topic) => (
            <Link key={topic.title} className="topic-card" to={topic.link}>
              <h3>{topic.title}</h3>
              <p>{topic.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function LearningPaths() {
  return (
    <section className={styles.paths}>
      <div className="container">
        <h2 className={styles.sectionTitle}>Choose Your Path</h2>
        <div className="topic-grid">
          <Link className="topic-card" to="/docs/getting-started/" style={{borderTop: '4px solid var(--aks-beginner)'}}>
            <h3>New to AKS</h3>
            <p>Start from zero. Learn Kubernetes basics, deploy your first app with AKS Automatic.</p>
            <p><strong>~4 hours</strong></p>
          </Link>
          <Link className="topic-card" to="/docs/networking/" style={{borderTop: '4px solid var(--aks-intermediate)'}}>
            <h3>AKS Builder</h3>
            <p>Developer/DevOps focused. Networking, CI/CD, scaling, and security for your apps.</p>
            <p><strong>~12 hours</strong></p>
          </Link>
          <Link className="topic-card" to="/docs/operations/" style={{borderTop: '4px solid var(--aks-advanced)'}}>
            <h3>AKS Operator</h3>
            <p>SRE/Platform Engineer. Advanced networking, operations, cost, and reliability.</p>
            <p><strong>~20 hours</strong></p>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Ecosystem() {
  return (
    <section className={styles.ecosystem}>
      <div className="container">
        <h2 className={styles.sectionTitle}>AKS Ecosystem</h2>
        <div className="topic-grid">
          <a className="topic-card" href="https://azure-samples.github.io/aks-labs" target="_blank" rel="noopener noreferrer">
            <h3>AKS Labs</h3>
            <p>Hands-on workshops to practice what you learn.</p>
          </a>
          <a className="topic-card" href="https://blog.aks.azure.com/" target="_blank" rel="noopener noreferrer">
            <h3>AKS Blog</h3>
            <p>Deep-dive technical articles and feature announcements.</p>
          </a>
          <a className="topic-card" href="https://aksnewsletter.com" target="_blank" rel="noopener noreferrer">
            <h3>AKS Newsletter</h3>
            <p>Monthly curated updates. No spam, unsubscribe anytime.</p>
          </a>
        </div>
      </div>
    </section>
  );
}

function NewsletterCTA() {
  return (
    <section className={styles.newsletter}>
      <div className="container">
        <div className="newsletter-banner">
          <h2>Stay Current with AKS</h2>
          <p>Monthly curated updates on features, docs, and community highlights.</p>
          <a href="https://aksnewsletter.com" target="_blank" rel="noopener noreferrer">
            Subscribe free at aksnewsletter.com →
          </a>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <HeroBanner />
      <main>
        <LearningPaths />
        <TopicGrid />
        <Ecosystem />
        <NewsletterCTA />
      </main>
    </Layout>
  );
}
