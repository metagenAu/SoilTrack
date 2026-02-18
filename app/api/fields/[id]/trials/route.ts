import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('field_trials')
    .select('*, trials(*)')
    .eq('field_id', params.id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
