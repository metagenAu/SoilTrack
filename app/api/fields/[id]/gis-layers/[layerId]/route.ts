import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth, safeErrorResponse } from '@/lib/api-utils'
import { canUpload, canModify } from '@/lib/auth'

export async function PUT(
  request: Request,
  { params }: { params: { id: string; layerId: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canUpload(auth.role)) {
    return NextResponse.json({ error: 'Upload permission required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if ('name' in body) updates.name = body.name
  if ('style' in body) updates.style = body.style

  const { data, error } = await supabase
    .from('field_gis_layers')
    .update(updates)
    .eq('id', params.layerId)
    .eq('field_id', params.id)
    .select()
    .single()

  if (error) return safeErrorResponse(error, 'PUT /api/fields/[id]/gis-layers/[layerId]')
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; layerId: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canModify(auth.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('field_gis_layers')
    .delete()
    .eq('id', params.layerId)
    .eq('field_id', params.id)

  if (error) return safeErrorResponse(error, 'DELETE /api/fields/[id]/gis-layers/[layerId]')
  return NextResponse.json({ ok: true })
}
