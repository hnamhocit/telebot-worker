import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Bindings } from '../types'

const DEFAULT_SUPABASE_URL = 'https://stbswcnsitztbusqrdhi.supabase.co'
const DEFAULT_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0YnN3Y25zaXR6dGJ1c3FyZGhpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDI1Mjc2MywiZXhwIjoyMTA1ODI4NzYzfQ.ag_TagaE5fe6hor21fPbr5abVr0LD3YahygwFJVjwlw'

/**
 * Get Supabase Admin client using Cloudflare Worker environment bindings
 */
export function getSupabase(env?: Bindings): SupabaseClient {
  const url = env?.SUPABASE_URL || DEFAULT_SUPABASE_URL
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_ROLE_KEY

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
