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
    .select('*, trials(*)')
    .eq('field_id', params.id)
    .order('created_at')

  if (error) return safeErrorResponse(error, 'GET /api/fields/[id]/trials')
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

  const { trial_id, season, notes } = body

  if (!trial_id) {
    return NextResponse.json({ error: 'trial_id is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('field_trials')
    .insert({
      field_id: params.id,
      trial_id,
      season: season || null,
      notes: notes || null,
    })
    .select('*, trials(*)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This trial is already linked to this field' }, { status: 409 })
    }
    return safeErrorResponse(error, 'POST /api/fields/[id]/trials')
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
  const trialId = searchParams.get('trial_id')

  if (!trialId) {
    return NextResponse.json({ error: 'trial_id query param required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('field_trials')
    .delete()
    .eq('field_id', params.id)
    .eq('trial_id', trialId)

  if (error) return safeErrorResponse(error, 'DELETE /api/fields/[id]/trials')
  return NextResponse.json({ ok: true })
}
