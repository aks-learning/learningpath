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
  { emoji: '🚀', title: 'Getting Started', description: 'Kubernetes basics & AKS intro', link: '/docs/getting-started/' },
  { emoji: '🔧', title: 'Cluster Setup', description: 'Tooling, IaC & design decisions', link: '/docs/cluster-setup/' },
  { emoji: '🌐', title: 'Networking', description: 'CNI, Ingress, Service Mesh', link: '/docs/networking/' },
  { emoji: '🔒', title: 'Security', description: 'Identity, policies & secrets', link: '/docs/security/' },
  { emoji: '📊', title: 'Observability', description: 'Monitor, Prometheus & Grafana', link: '/docs/observability/' },
  { emoji: '⚡', title: 'Scaling', description: 'HPA, KEDA & Cluster Autoscaler', link: '/docs/scaling/' },
  { emoji: '💾', title: 'Storage', description: 'Disks, Files & Container Storage', link: '/docs/storage/' },
  { emoji: '🚢', title: 'Deployments & GitOps', description: 'CI/CD, Flux & Argo CD', link: '/docs/deployments/' },
  { emoji: '🤖', title: 'AI/ML Workloads', description: 'GPUs, KAITO & inference', link: '/docs/ai-workloads/' },
  { emoji: '🏢', title: 'Operations', description: 'Upgrades, DR & Fleet', link: '/docs/operations/' },
  { emoji: '📚', title: 'Best Practices', description: 'Architecture & cost optimization', link: '/docs/best-practices/' },
];

function TopicGrid() {
  return (
    <section className={styles.topics}>
      <div className="container">
        <h2 className={styles.sectionTitle}>📚 Topics</h2>
        <div className="topic-grid">
          {topics.map((topic) => (
            <Link key={topic.title} className="topic-card" to={topic.link}>
              <span style={{fontSize: '2rem'}}>{topic.emoji}</span>
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
        <h2 className={styles.sectionTitle}>🛤️ Choose Your Path</h2>
        <div className="topic-grid">
          <div className="topic-card" style={{borderTop: '4px solid var(--aks-beginner)'}}>
            <h3>🟢 New to AKS</h3>
            <p>Start from zero. Learn Kubernetes basics, deploy your first app with AKS Automatic.</p>
            <p><strong>~4 hours</strong></p>
          </div>
          <div className="topic-card" style={{borderTop: '4px solid var(--aks-intermediate)'}}>
            <h3>🟡 AKS Builder</h3>
            <p>Developer/DevOps focused. Networking, CI/CD, scaling, and security for your apps.</p>
            <p><strong>~12 hours</strong></p>
          </div>
          <div className="topic-card" style={{borderTop: '4px solid var(--aks-advanced)'}}>
            <h3>🔴 AKS Operator</h3>
            <p>SRE/Platform Engineer. Advanced networking, operations, cost, and reliability.</p>
            <p><strong>~20 hours</strong></p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Ecosystem() {
  return (
    <section className={styles.ecosystem}>
      <div className="container">
        <h2 className={styles.sectionTitle}>🔗 AKS Ecosystem</h2>
        <div className="topic-grid">
          <a className="topic-card" href="https://azure-samples.github.io/aks-labs" target="_blank" rel="noopener noreferrer">
            <span style={{fontSize: '2rem'}}>🧪</span>
            <h3>AKS Labs</h3>
            <p>Hands-on workshops to practice what you learn.</p>
          </a>
          <a className="topic-card" href="https://blog.aks.azure.com/" target="_blank" rel="noopener noreferrer">
            <span style={{fontSize: '2rem'}}>📖</span>
            <h3>AKS Blog</h3>
            <p>Deep-dive technical articles and feature announcements.</p>
          </a>
          <a className="topic-card" href="https://aksnewsletter.com" target="_blank" rel="noopener noreferrer">
            <span style={{fontSize: '2rem'}}>📰</span>
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
          <h2>📰 Stay Current with AKS</h2>
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
