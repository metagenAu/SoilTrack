import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export type UserRole = 'admin' | 'upload' | 'readonly'

/**
 * Get the current user's role from the profiles table.
 * Returns 'readonly' if no profile row exists.
 * Call from Server Components or API routes only.
 *
 * Wrapped with React cache() so that multiple calls within the same
 * request (e.g. layout + page) only hit the database once.
 */
export const getUserRole = cache(async (): Promise<{ role: UserRole; userId: string | null }> => {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { role: 'readonly', userId: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile?.role as UserRole) || 'readonly'
  return { role, userId: user.id }
})

/**
 * Check if a role can upload data (admin or upload).
 */
export function canUpload(role: UserRole): boolean {
  return role === 'admin' || role === 'upload'
}

/**
 * Check if a role can delete/modify trials (admin only).
 */
export function canModify(role: UserRole): boolean {
  return role === 'admin'
}

/**
 * Check if a role can manage users (admin only).
 */
export function canManageUsers(role: UserRole): boolean {
  return role === 'admin'
}
