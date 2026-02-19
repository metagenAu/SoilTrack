import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/users
 * List all user profiles. Admin only.
 */
export async function GET() {
  const { role, userId } = await getUserRole()

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .order('created_at')

  if (error) {
    console.error('[GET /api/admin/users]', error.message)
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }

  return NextResponse.json({ users: data })
}

/**
 * PATCH /api/admin/users
 * Update a user's role. Admin only.
 * Body: { userId: string, role: 'admin' | 'upload' | 'readonly' }
 */
export async function PATCH(request: NextRequest) {
  const { role: callerRole, userId: callerId } = await getUserRole()

  if (!callerId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (callerRole !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { userId, role } = body

  if (!userId || !role) {
    return NextResponse.json({ error: 'Missing userId or role' }, { status: 400 })
  }

  const validRoles = ['admin', 'upload', 'readonly']
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, { status: 400 })
  }

  // Prevent admin from removing their own admin role
  if (userId === callerId && role !== 'admin') {
    return NextResponse.json({ error: 'Cannot remove your own admin role' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)

  if (error) {
    console.error('[PATCH /api/admin/users]', error.message)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }

  return NextResponse.json({ status: 'success' })
}
