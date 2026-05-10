import { defineConfig } from 'vitest/config';

/**
 * Workspace-wide vitest config. We deliberately exclude `apps/mobile`
 * because it uses jest (the React Native ecosystem standard) — see
 * `apps/mobile/jest.config.js`.
 *
 * The `edge-runtime` environment is the convex-test recommended setup —
 * it gives the same V8 + WHATWG primitives that Convex functions actually
 * run against. SDK / facade tests don't care which env they run in.
 *
 * Run from the repo root: `bun run test`
 */
export default defineConfig({
  // React Native libraries (and a few of their transitive deps) reach for
  // `__DEV__` at module scope. Define it as a global constant so import-
  // time evaluation in the test runtime doesn't crash.
  define: {
    __DEV__: 'true'
  },
  test: {
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'apps/backend/**/*.test.ts',
      // Mobile pure helpers / hooks. Component / screen tests are out of
      // scope — vitest doesn't run React Native's renderer.
      'apps/mobile/lib/**/*.test.ts'
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/web/**', 'public-mirror/**'],
    environment: 'edge-runtime',
    globals: true,
    server: {
      deps: { inline: ['convex-test'] }
    }
  }
});
