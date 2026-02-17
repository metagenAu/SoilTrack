import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const maxDuration = 60

// POST /api/sample-point-sets/[setId]/points — add points (single or bulk)
export async function POST(
  request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()

  // Verify set exists
  const { data: set } = await supabase
    .from('sample_point_sets')
    .select('id')
    .eq('id', params.setId)
    .single()

  if (!set) {
    return NextResponse.json({ error: 'Point set not found' }, { status: 404 })
  }

  // Accept single point or array of points
  const pointsInput = Array.isArray(body.points) ? body.points : [body]

  const points = pointsInput.map((p: any, i: number) => ({
    set_id: params.setId,
    label: p.label || `SP-${String(i + 1).padStart(3, '0')}`,
    latitude: p.latitude,
    longitude: p.longitude,
    notes: p.notes || null,
    properties: p.properties || {},
    sort_order: p.sort_order ?? i,
  }))

  // Validate all points have coordinates
  for (const p of points) {
    if (p.latitude == null || p.longitude == null) {
      return NextResponse.json(
        { error: `Point "${p.label}" is missing latitude or longitude` },
        { status: 400 }
      )
    }
  }

  const { data, error } = await supabase
    .from('sample_points')
    .insert(points)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update the set's updated_at
  await supabase
    .from('sample_point_sets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.setId)

  return NextResponse.json({ points: data })
}

// PUT /api/sample-point-sets/[setId]/points — replace all points (for bulk update / re-generation)
export async function PUT(
  request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()

  // Verify set exists
  const { data: set } = await supabase
    .from('sample_point_sets')
    .select('id')
    .eq('id', params.setId)
    .single()

  if (!set) {
    return NextResponse.json({ error: 'Point set not found' }, { status: 404 })
  }

  // Delete existing points (cascades to point_data_values via point_id)
  await supabase.from('sample_points').delete().eq('set_id', params.setId)

  // Insert new points
  const pointsInput = Array.isArray(body.points) ? body.points : []
  if (pointsInput.length === 0) {
    return NextResponse.json({ points: [] })
  }

  const points = pointsInput.map((p: any, i: number) => ({
    set_id: params.setId,
    label: p.label || `SP-${String(i + 1).padStart(3, '0')}`,
    latitude: p.latitude,
    longitude: p.longitude,
    notes: p.notes || null,
    properties: p.properties || {},
    sort_order: p.sort_order ?? i,
  }))

  const { data, error } = await supabase
    .from('sample_points')
    .insert(points)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase
    .from('sample_point_sets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.setId)

  return NextResponse.json({ points: data })
}
