import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Translate, {translate} from '@docusaurus/Translate';

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
            <Translate id="homepage.hero.startLearning">Start Learning →</Translate>
          </Link>
          <a className="button button--secondary button--lg" href="#topics">
            <Translate id="homepage.hero.browseTopics">Browse Topics</Translate>
          </a>
        </div>
      </div>
    </header>
  );
}

const topics = [
  { id: 'gettingStarted', title: 'Getting Started', description: 'Kubernetes basics & AKS intro', link: '/docs/getting-started/' },
  { id: 'clusterSetup', title: 'Cluster Setup', description: 'Tooling, IaC & design decisions', link: '/docs/cluster-setup/' },
  { id: 'networking', title: 'Networking', description: 'CNI, Ingress, Service Mesh', link: '/docs/networking/' },
  { id: 'security', title: 'Security', description: 'Identity, policies & secrets', link: '/docs/security/' },
  { id: 'observability', title: 'Observability', description: 'Monitor, Prometheus & Grafana', link: '/docs/observability/' },
  { id: 'scaling', title: 'Scaling', description: 'HPA, KEDA & Cluster Autoscaler', link: '/docs/scaling/' },
  { id: 'storage', title: 'Storage', description: 'Disks, Files & Container Storage', link: '/docs/storage/' },
  { id: 'deployments', title: 'Deployments & GitOps', description: 'CI/CD, Flux & Argo CD', link: '/docs/deployments/' },
  { id: 'aiMl', title: 'AI/ML Workloads', description: 'GPUs, KAITO & inference', link: '/docs/ai-workloads/' },
  { id: 'operations', title: 'Operations', description: 'Upgrades, DR & Fleet', link: '/docs/operations/' },
  { id: 'bestPractices', title: 'Best Practices', description: 'Architecture & cost optimization', link: '/docs/best-practices/' },
];

function TopicGrid() {
  return (
    <section id="topics" className={styles.topics}>
      <div className="container">
        <h2 className={styles.sectionTitle}><Translate id="homepage.topics.title">Topics</Translate></h2>
        <div className="topic-grid">
          {topics.map((topic) => (
            <Link key={topic.id} className="topic-card" to={topic.link}>
              <h3><Translate id={`homepage.topics.${topic.id}.title`}>{topic.title}</Translate></h3>
              <p><Translate id={`homepage.topics.${topic.id}.desc`}>{topic.description}</Translate></p>
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
        <h2 className={styles.sectionTitle}><Translate id="homepage.paths.title">Choose Your Path</Translate></h2>
        <div className="topic-grid">
          <Link className="topic-card" to="/docs/getting-started/" style={{borderTop: '4px solid var(--aks-beginner)'}}>
            <h3><Translate id="homepage.paths.beginner.title">New to AKS</Translate></h3>
            <p><Translate id="homepage.paths.beginner.desc">Start from zero. Learn Kubernetes basics, deploy your first app with AKS Automatic.</Translate></p>
            <p><strong><Translate id="homepage.paths.beginner.time">~4 hours</Translate></strong></p>
          </Link>
          <Link className="topic-card" to="/docs/networking/" style={{borderTop: '4px solid var(--aks-intermediate)'}}>
            <h3><Translate id="homepage.paths.builder.title">AKS Builder</Translate></h3>
            <p><Translate id="homepage.paths.builder.desc">Developer/DevOps focused. Networking, CI/CD, scaling, and security for your apps.</Translate></p>
            <p><strong><Translate id="homepage.paths.builder.time">~12 hours</Translate></strong></p>
          </Link>
          <Link className="topic-card" to="/docs/operations/" style={{borderTop: '4px solid var(--aks-advanced)'}}>
            <h3><Translate id="homepage.paths.operator.title">AKS Operator</Translate></h3>
            <p><Translate id="homepage.paths.operator.desc">SRE/Platform Engineer. Advanced networking, operations, cost, and reliability.</Translate></p>
            <p><strong><Translate id="homepage.paths.operator.time">~20 hours</Translate></strong></p>
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
        <h2 className={styles.sectionTitle}><Translate id="homepage.ecosystem.title">AKS Ecosystem</Translate></h2>
        <div className="topic-grid">
          <a className="topic-card" href="https://azure-samples.github.io/aks-labs" target="_blank" rel="noopener noreferrer">
            <h3>AKS Labs</h3>
            <p><Translate id="homepage.ecosystem.labs.desc">Hands-on workshops to practice what you learn.</Translate></p>
          </a>
          <a className="topic-card" href="https://blog.aks.azure.com/" target="_blank" rel="noopener noreferrer">
            <h3>AKS Blog</h3>
            <p><Translate id="homepage.ecosystem.blog.desc">Deep-dive technical articles and feature announcements.</Translate></p>
          </a>
          <a className="topic-card" href="https://aksnewsletter.com" target="_blank" rel="noopener noreferrer">
            <h3>AKS Newsletter</h3>
            <p><Translate id="homepage.ecosystem.newsletter.desc">Monthly curated updates. No spam, unsubscribe anytime.</Translate></p>
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
          <h2><Translate id="homepage.newsletter.title">Stay Current with AKS</Translate></h2>
          <p><Translate id="homepage.newsletter.desc">Monthly curated updates on features, docs, and community highlights.</Translate></p>
          <a href="https://aksnewsletter.com" target="_blank" rel="noopener noreferrer">
            <Translate id="homepage.newsletter.cta">Subscribe free at aksnewsletter.com →</Translate>
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
