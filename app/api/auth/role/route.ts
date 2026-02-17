import { NextResponse } from 'next/server'
import { getUserRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/role
 * Returns the current user's role.
 */
export async function GET() {
  const { role, userId } = await getUserRole()

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  return NextResponse.json({ role })
}
