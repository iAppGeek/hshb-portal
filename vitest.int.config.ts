import path from 'path'

import { defineConfig } from 'vitest/config'

// Integration specs for src/db, run against the local Supabase Postgres
// (`npm run supabase:start`). Kept apart from vitest.config.ts so unit runs
// and coverage never need a database.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.int.spec.ts'],
    // Truncates every public table and loads supabase/seed.sql once per run.
    globalSetup: ['./vitest.int.global-setup.ts'],
    setupFiles: ['./vitest.int.setup.ts'],
    // One database, so one spec file at a time.
    fileParallelism: false,
    // src/env.server.ts parses process.env at import time. DATABASE_URL and the
    // Supabase URL (for the .rpc() calls kept until plan 10) default to the
    // local Supabase CLI stack. SUPABASE_SERVICE_ROLE_KEY comes from .env.e2e
    // locally (see `npm run test:int`) and from a secret in CI. The rest are
    // placeholders the db layer never uses.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      AUTH_SECRET: 'test-auth-secret',
      AZURE_AD_CLIENT_ID: 'test-client-id',
      AZURE_AD_TENANT_ID: 'test-tenant-id',
      AZURE_AD_CLIENT_SECRET: 'test-client-secret',
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      VAPID_PRIVATE_KEY: 'test-vapid-private-key',
      VAPID_SUBJECT: 'mailto:test@example.com',
      TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(
        __dirname,
        './node_modules/server-only/empty.js',
      ),
    },
  },
})
