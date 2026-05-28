import type { Provider } from './providerDetection';

export type Recipe = {
  id: string;
  provider: Provider;
  name: string;
  description: string;
  /** Suggested name when creating the source app */
  suggestedName: string;
  suggestedDescription?: string;
  /** Recommended priority (1-10) for most events from this source */
  recommendedPriority?: number;
  /** Suggested quiet hours as [startMinute, endMinute] since midnight */
  suggestedQuietHours?: [number, number] | null;
  /** Human-friendly example of how to send a notification */
  example: {
    title: string;
    body: string;
    curl: string;
  };
  /** Short setup note shown in the picker */
  setupNote: string;
  /** Optional accent color hint for branding suggestions */
  accentHint?: string;
};

/**
 * Curated, high-signal recipes for the "Add source app" flow.
 * These are derived from the production webhook adapters in the backend
 * plus the most common manual /notify patterns our users actually ship.
 *
 * Keep this list focused and delightful — quality over quantity.
 */
export const RECIPES: Recipe[] = [
  {
    id: 'github',
    provider: 'github',
    name: 'GitHub',
    description: 'PRs, issues, deployments, workflow failures',
    suggestedName: 'GitHub',
    suggestedDescription: 'Pull requests, issues, and CI events',
    recommendedPriority: 6,
    suggestedQuietHours: [22 * 60, 8 * 60], // 10pm – 8am
    example: {
      title: 'myorg/api PR #1284 opened',
      body: 'feat: add rate limiting',
      curl: `curl -X POST "$PUSHR_URL/notify" \\
  -H "Authorization: Bearer $PUSHR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
  "title": "myorg/api PR #1284 opened",
  "body": "feat: add rate limiting",
  "priority": 6,
  "url": "https://github.com/myorg/api/pull/1284"
}'`,
    },
    setupNote: 'Paste your pushr token into the GitHub repo webhook settings. We verify signatures automatically.',
    accentHint: '#24292f',
  },
  {
    id: 'sentry',
    provider: 'sentry',
    name: 'Sentry',
    description: 'Errors and performance alerts',
    suggestedName: 'Sentry',
    suggestedDescription: 'Production errors and releases',
    recommendedPriority: 8,
    suggestedQuietHours: null,
    example: {
      title: 'TypeError in checkout — 47 users',
      body: 'Cannot read properties of undefined (reading "id")',
      curl: `curl -X POST "$PUSHR_URL/notify" \\
  -H "Authorization: Bearer $PUSHR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
  "title": "TypeError in checkout — 47 users",
  "body": "Cannot read properties of undefined (reading \\"id\\")",
  "priority": 8,
  "url": "https://sentry.io/organizations/myorg/issues/123456/"
}'`,
    },
    setupNote: 'Create an Internal Integration in Sentry and point the webhook at /hooks/sentry?token=...',
    accentHint: '#362d59',
  },
  {
    id: 'grafana',
    provider: 'grafana',
    name: 'Grafana',
    description: 'Alerting rules firing',
    suggestedName: 'Grafana',
    suggestedDescription: 'Infrastructure and metric alerts',
    recommendedPriority: 7,
    suggestedQuietHours: [23 * 60, 7 * 60],
    example: {
      title: 'DB disk > 90% (3 firing)',
      body: 'postgres-main, redis-cache',
      curl: `curl -X POST "$PUSHR_URL/notify" \\
  -H "Authorization: Bearer $PUSHR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
  "title": "DB disk > 90% (3 firing)",
  "body": "postgres-main, redis-cache",
  "priority": 7
}'`,
    },
    setupNote: 'Add a webhook contact point in Grafana pointing at /hooks/grafana?token=...',
    accentHint: '#f05a28',
  },
  {
    id: 'ci-deploy',
    provider: 'generic',
    name: 'CI / Deployments',
    description: 'Builds, deploys, and release pipelines',
    suggestedName: 'CI',
    suggestedDescription: 'Deployments and build status',
    recommendedPriority: 5,
    suggestedQuietHours: [23 * 60, 7 * 60],
    example: {
      title: 'Deploy #42 succeeded',
      body: 'main → production (4m 12s)',
      curl: `curl -X POST "$PUSHR_URL/notify" \\
  -H "Authorization: Bearer $PUSHR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
  "title": "Deploy #42 succeeded",
  "body": "main \u2192 production (4m 12s)",
  "priority": 5,
  "url": "https://ci.example.com/builds/42"
}'`,
    },
    setupNote: 'Send from your CI system (GitHub Actions, Buildkite, etc.) using a simple curl or our SDK.',
    accentHint: '#34C759',
  },
  {
    id: 'custom',
    provider: 'generic',
    name: 'Custom / Everything else',
    description: 'Any script or service that can POST JSON',
    suggestedName: 'My App',
    suggestedDescription: '',
    recommendedPriority: 5,
    suggestedQuietHours: null,
    example: {
      title: 'New user signed up',
      body: 'user@example.com from iOS',
      curl: `curl -X POST "$PUSHR_URL/notify" \\
  -H "Authorization: Bearer $PUSHR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
  "title": "New user signed up",
  "body": "user@example.com from iOS",
  "priority": 4,
  "url": "https://myapp.com/admin/users/123"
}'`,
    },
    setupNote: 'Any HTTP POST with a bearer token works. Store the token securely.',
    accentHint: undefined,
  },
];

/**
 * Get a recipe by id (for the create flow).
 */
export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

/**
 * Recipes grouped by category for nicer UI presentation.
 */
export const RECIPE_GROUPS = [
  {
    title: 'Popular integrations',
    recipes: RECIPES.filter((r) => ['github', 'sentry', 'grafana'].includes(r.id)),
  },
  {
    title: 'General',
    recipes: RECIPES.filter((r) => !['github', 'sentry', 'grafana'].includes(r.id)),
  },
] as const;