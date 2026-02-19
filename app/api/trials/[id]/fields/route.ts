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
    .from('field_trials')
    .select('*, fields(*)')
    .eq('trial_id', params.id)
    .order('created_at')

  if (error) return safeErrorResponse(error, 'GET /api/trials/[id]/fields')
  return NextResponse.json(data)
}

export async function POST(
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

  const { field_id, season, notes } = body

  if (!field_id) {
    return NextResponse.json({ error: 'field_id is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('field_trials')
    .insert({
      field_id,
      trial_id: params.id,
      season: season || null,
      notes: notes || null,
    })
    .select('*, fields(*)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This field is already linked to this trial' }, { status: 409 })
    }
    return safeErrorResponse(error, 'POST /api/trials/[id]/fields')
  }
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canModify(auth.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const fieldId = searchParams.get('field_id')

  if (!fieldId) {
    return NextResponse.json({ error: 'field_id query param required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('field_trials')
    .delete()
    .eq('trial_id', params.id)
    .eq('field_id', fieldId)

  if (error) return safeErrorResponse(error, 'DELETE /api/trials/[id]/fields')
  return NextResponse.json({ ok: true })
}
