import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase client with the service role key, bypassing RLS.
 * Use only in server-side contexts for public-facing data (e.g. landing page stats).
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return null
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}
