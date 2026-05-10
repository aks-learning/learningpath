import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'AKS Learning Path',
  tagline: 'From zero to production on Azure Kubernetes Service',
  favicon: 'img/favicon.svg',

  url: 'https://aks-learning.github.io',
  baseUrl: '/',

  organizationName: 'aks-learning',
  projectName: 'aks-learning.github.io',

  onBrokenLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'pt-BR'],
    localeConfigs: {
      en: { label: 'English' },
      'pt-BR': { label: 'Português (BR)' },
    },
  },

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/docs',
        searchBarShortcutHint: true,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/aks-learning/aks-learning.github.io/tree/master/',
        },
        blog: false,
        gtag: {
          trackingID: 'G-J0K9ZYJ0YN',
          anonymizeIP: true,
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/aks-learning-social-card.png',
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'AKS Learning Path',
      logo: {
        alt: 'AKS Learning Path Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'learningPath',
          position: 'left',
          label: 'Learn',
        },
        {
          href: 'https://azure-samples.github.io/aks-labs',
          label: 'Labs',
          position: 'left',
        },
        {
          href: 'https://blog.aks.azure.com/',
          label: 'Blog',
          position: 'left',
        },
        {
          href: 'https://aksnewsletter.com',
          label: 'Newsletter',
          position: 'left',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/aks-learning/aks-learning.github.io',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Learn',
          items: [
            { label: 'Getting started', to: '/docs/getting-started/' },
            { label: 'All topics', to: '/docs/' },
          ],
        },
        {
          title: 'Ecosystem',
          items: [
            { label: 'AKS Labs (Workshops)', href: 'https://azure-samples.github.io/aks-labs' },
            { label: 'AKS Blog', href: 'https://blog.aks.azure.com/' },
            { label: 'AKS Newsletter', href: 'https://aksnewsletter.com' },
            { label: 'AKS Documentation', href: 'https://learn.microsoft.com/en-us/azure/aks/' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: 'https://github.com/aks-learning/aks-learning.github.io' },
            { label: 'Contribute', href: 'https://github.com/aks-learning/aks-learning.github.io/blob/master/CONTRIBUTING.md' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} AKS Learning Path. Built with Docusaurus. Open source & community-driven.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json', 'bicep', 'hcl'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;

