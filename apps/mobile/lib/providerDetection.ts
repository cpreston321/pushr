import type { FeedItem } from './feed-helpers';

/**
 * Known providers that can receive special rich card treatment in the feed.
 * These align with the webhook adapters in the backend (hooks/github.ts etc.)
 * and any future `data.provider` or `webhookProvider` values we normalize.
 */
export const KNOWN_PROVIDERS = ['github', 'sentry', 'grafana'] as const;

export type Provider = (typeof KNOWN_PROVIDERS)[number] | 'generic';

/**
 * Detect the source/provider for a notification so we can render a rich card.
 *
 * Priority:
 * 1. Explicit `webhookProvider` (set by /hooks/:provider adapters)
 * 2. `data.provider` (many adapters also embed this, e.g. GitHub adapter)
 * 3. Heuristics on sourceAppName or title (future extensibility)
 * 4. Fallback to 'generic'
 */
export function detectProvider(item: FeedItem): Provider {
  const wp = (item as any).webhookProvider as string | undefined;
  if (wp && KNOWN_PROVIDERS.includes(wp as any)) {
    return wp as Provider;
  }

  const dp = item.data?.provider as string | undefined;
  if (dp && KNOWN_PROVIDERS.includes(dp as any)) {
    return dp as Provider;
  }

  // Future: cheap name-based heuristics for manually created apps
  // e.g. if (/github/i.test(item.sourceAppName)) return 'github';
  // For v1 we keep it conservative and rely on the adapter path.

  return 'generic';
}

/**
 * Human label + accent tint suggestion for a provider.
 * Used by rich cards and (later) recipe/branding suggestions.
 */
export function getProviderMeta(provider: Provider): {
  label: string;
  tint?: string; // optional brand-ish accent override
} {
  switch (provider) {
    case 'github':
      return { label: 'GitHub', tint: '#24292f' };
    case 'sentry':
      return { label: 'Sentry', tint: '#362d59' };
    case 'grafana':
      return { label: 'Grafana', tint: '#f05a28' };
    default:
      return { label: 'App' };
  }
}

/**
 * Returns true if this provider has (or will have) a dedicated rich card renderer.
 */
export function hasRichCard(provider: Provider): boolean {
  return provider !== 'generic';
}
