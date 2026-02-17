import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// POST /api/sample-point-sets/[setId]/import-existing
// Import GPS points from existing soil_health_samples for this trial
export async function POST(
  _request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const supabase = createServerSupabaseClient()

  // Fetch the set to get trial_id
  const { data: set } = await supabase
    .from('sample_point_sets')
    .select('id, trial_id')
    .eq('id', params.setId)
    .single()

  if (!set) {
    return NextResponse.json({ error: 'Point set not found' }, { status: 404 })
  }

  // Fetch existing soil health samples with GPS coordinates
  const { data: samples, error: samplesError } = await supabase
    .from('soil_health_samples')
    .select('sample_no, latitude, longitude, property, block')
    .eq('trial_id', set.trial_id)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('sample_no')

  if (samplesError) {
    return NextResponse.json({ error: samplesError.message }, { status: 500 })
  }

  if (!samples || samples.length === 0) {
    return NextResponse.json(
      { error: 'No GPS-enabled soil health samples found for this trial' },
      { status: 404 }
    )
  }

  // Get existing labels in this set to avoid duplicates
  const { data: existingPoints } = await supabase
    .from('sample_points')
    .select('label')
    .eq('set_id', params.setId)

  const existingLabels = new Set((existingPoints || []).map((p: any) => p.label))

  // Build points from samples, skipping any that already exist by label
  const points = samples
    .filter((s: any) => !existingLabels.has(s.sample_no))
    .map((s: any, i: number) => ({
      set_id: params.setId,
      label: s.sample_no,
      latitude: s.latitude,
      longitude: s.longitude,
      notes: null,
      properties: {
        source: 'soil_health_samples',
        property: s.property || null,
        block: s.block || null,
      },
      sort_order: existingLabels.size + i,
    }))

  if (points.length === 0) {
    return NextResponse.json(
      { error: 'All existing GPS samples are already in this point set' },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from('sample_points')
    .insert(points)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update set metadata
  await supabase
    .from('sample_point_sets')
    .update({
      source: 'existing_samples',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.setId)

  return NextResponse.json({
    imported: data.length,
    skipped: samples.length - points.length,
    points: data,
  })
}
