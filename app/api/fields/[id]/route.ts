import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth, safeErrorResponse } from '@/lib/api-utils'
import { canUpload, canModify } from '@/lib/auth'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('fields')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Field not found' }, { status: 404 })
  }
  return NextResponse.json(data)
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canUpload(auth.role)) {
    return NextResponse.json({ error: 'Upload permission required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const body = await request.json()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const key of ['name', 'client_id', 'region', 'farm', 'area_ha', 'boundary', 'boundary_source', 'notes']) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await supabase
    .from('fields')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return safeErrorResponse(error, 'PUT /api/fields/[id]')
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canModify(auth.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('fields')
    .delete()
    .eq('id', params.id)

  if (error) return safeErrorResponse(error, 'DELETE /api/fields/[id]')
  return NextResponse.json({ ok: true })
}
