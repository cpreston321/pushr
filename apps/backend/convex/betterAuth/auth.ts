import { createClient } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import type { GenericCtx } from '@convex-dev/better-auth/utils';
import { betterAuth } from 'better-auth';
import { components } from '../_generated/api';
import type { DataModel } from '../_generated/dataModel';
import authConfig from '../auth.config';
import schema from './schema';

export const authComponent = createClient<DataModel, typeof schema>(components.betterAuth, {
  local: { schema },
  verbose: false
});

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => ({
  appName: 'pushr',
  baseURL: process.env.SITE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Better Auth blocks requests whose Origin isn't on this list. Mobile
  // builds send `pushr://` (the Expo URL scheme); the dev client also sends
  // `exp://…` in some flows. The bare scheme covers production; the wildcard
  // covers Expo Go / dev-client variants.
  trustedOrigins: [process.env.SITE_URL!, 'pushr://', 'pushr://*', 'exp://*'],
  database: authComponent.adapter(ctx),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  },
  plugins: [convex({ authConfig, jwt: { expirationSeconds: 60 * 60 * 24 * 30 } })]
});

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};

export const { getAuthUser } = authComponent.clientApi();
