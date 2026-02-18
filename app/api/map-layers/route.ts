import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRole, canUpload } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const { role } = await getUserRole()
  if (!canUpload(role)) {
    return NextResponse.json({ error: 'Upload permission required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { trial_id, name, metric_columns, points } = body

  if (!trial_id || !name || !Array.isArray(metric_columns) || !Array.isArray(points)) {
    return NextResponse.json(
      { error: 'trial_id, name, metric_columns (string[]), and points (array) are required' },
      { status: 400 }
    )
  }

  if (points.length === 0) {
    return NextResponse.json({ error: 'No valid points provided' }, { status: 400 })
  }

  if (metric_columns.length === 0) {
    return NextResponse.json({ error: 'At least one metric column is required' }, { status: 400 })
  }

  // Verify trial exists
  const { data: trial } = await supabase.from('trials').select('id').eq('id', trial_id).single()
  if (!trial) {
    return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
  }

  // Insert layer
  const { data: layer, error: dbError } = await supabase
    .from('custom_map_layers')
    .insert({
      trial_id,
      name,
      metric_columns,
      points,
      point_count: points.length,
    })
    .select()
    .single()

  if (dbError) {
    console.error('[POST /api/map-layers]', dbError.message)
    return NextResponse.json(
      { error: 'Failed to save map layer. Please try again.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ status: 'success', layer })
}
