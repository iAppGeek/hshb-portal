import 'server-only'

import { z } from 'zod'

const serverSchema = z
  .object({
    AUTH_SECRET: z.string().min(1),
    AUTH_URL: z.string().url().optional(),
    AZURE_AD_CLIENT_ID: z.string().min(1),
    AZURE_AD_TENANT_ID: z.string().min(1),
    AZURE_AD_CLIENT_SECRET: z.string().min(1),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(), // removed in plan 10
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), // removed in plan 10
    VAPID_PRIVATE_KEY: z.string().min(1),
    VAPID_SUBJECT: z.string().startsWith('mailto:'),
    TURNSTILE_SECRET_KEY: z.string().min(1),
    TURNSTILE_EXPECTED_HOSTNAME: z.string().optional(),
    // Unset, '' and 'false' all mean off; any other value is a typo and fails.
    E2E_TEST: z
      .enum(['true', 'false', ''])
      .optional()
      .transform((v) => v === 'true'),
    E2E_TEST_SECRET: z.string().optional(),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
  })
  .refine((e) => !e.E2E_TEST || Boolean(e.E2E_TEST_SECRET), {
    message: 'E2E_TEST_SECRET is required when E2E_TEST=true',
    path: ['E2E_TEST_SECRET'],
  })

export const env = serverSchema.parse(process.env)
