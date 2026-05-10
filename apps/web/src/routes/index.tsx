import { createFileRoute } from '@tanstack/react-router';
import { Hero } from '../components/Hero';
import { Features } from '../components/Features';
import { Compared } from '../components/Compared';
import { Recipe } from '../components/Recipe';
import { CodeShowcase } from '../components/CodeShowcase';
import { Footer } from '../components/Footer';
import { SiteHeader } from '../components/SiteHeader';

export const Route = createFileRoute('/')({
  component: LandingPage
});

function LandingPage() {
  return (
    <main className="relative">
      <SiteHeader
        nav={[
          { kind: 'anchor', label: 'features', href: '#features' },
          { kind: 'route', label: 'docs', to: '/docs' },
          { kind: 'route', label: 'log', to: '/changelog' },
          { kind: 'anchor', label: 'install', href: '#install' }
        ]}
      />
      <Hero />
      <Features />
      <Compared />
      <Recipe />
      <CodeShowcase />
      <Footer />
    </main>
  );
}
