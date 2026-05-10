/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import indexCss from '../index.css?url';
import { NotFound } from '../components/NotFound';

export const Route = createRootRoute({
  notFoundComponent: () => <NotFound />,
  errorComponent: ({ error }) => <NotFound error={error} />,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1.0, viewport-fit=cover'
      },
      { name: 'theme-color', content: '#0a0f1c' },
      { title: 'pushr.sh — your phone, on the wire' },
      {
        name: 'description',
        content:
          'A personal push-notification hub. Any project POSTs to a URL — your iPhone lights up. Built for builders.'
      },
      { property: 'og:title', content: 'pushr.sh' },
      {
        property: 'og:description',
        content:
          'POST a payload, light up your phone. Live Activities, Dynamic Island, badges, sounds — everything iOS can do.'
      },
      { property: 'og:type', content: 'website' }
    ],
    links: [
      { rel: 'stylesheet', href: indexCss },
      { rel: 'icon', type: 'image/png', href: '/pushr-icon.png' },
      { rel: 'apple-touch-icon', href: '/pushr-icon.png' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous'
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600&display=swap'
      }
    ]
  }),
  shellComponent: RootDocument
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="root">{children}</div>
        <Scripts />
      </body>
    </html>
  );
}

export function RouteOutlet() {
  return <Outlet />;
}
