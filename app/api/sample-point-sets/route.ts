import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const maxDuration = 60

// GET /api/sample-point-sets?trialId=...
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const trialId = request.nextUrl.searchParams.get('trialId')

  if (!trialId) {
    return NextResponse.json({ error: 'trialId is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sample_point_sets')
    .select(`
      *,
      sample_points(*),
      point_data_layers(*)
    `)
    .eq('trial_id', trialId)
    .order('created_at')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sets: data })
}

// POST /api/sample-point-sets — create a new point set
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()

  const { trial_id, name, description, source, parameters, style } = body

  if (!trial_id || !name) {
    return NextResponse.json({ error: 'trial_id and name are required' }, { status: 400 })
  }

  // Verify trial exists
  const { data: trial } = await supabase.from('trials').select('id').eq('id', trial_id).single()
  if (!trial) {
    return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
  }

  const { data: set, error } = await supabase
    .from('sample_point_sets')
    .insert({
      trial_id,
      name,
      description: description || null,
      source: source || 'manual',
      parameters: parameters || null,
      style: style || { color: '#3b82f6', radius: 7 },
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update data coverage
  await supabase.from('trial_data_files').upsert({
    trial_id,
    file_type: 'samplePoints',
    has_data: true,
    last_updated: new Date().toISOString(),
  })

  return NextResponse.json({ set })
}
