import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { env } from '@/env.server'

import type { Database } from '../types/database'

/** Kept until plan 10 for `.rpc()` calls only. */
export const supabase = createClient<Database>(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
)
