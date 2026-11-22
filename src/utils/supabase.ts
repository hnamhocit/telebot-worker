import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Bindings } from '../types'

/**
 * Get Supabase Admin client using Cloudflare Worker environment bindings
 */
export function getSupabase(env?: Bindings): SupabaseClient {
  const url = env?.SUPABASE_URL
  const key = env?.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase bindings are missing")

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
