import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// GET /api/sample-point-sets/[setId] — get a single set with all points and layers
export async function GET(
  _request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('sample_point_sets')
    .select(`
      *,
      sample_points(*),
      point_data_layers(
        *,
        point_data_values(*)
      )
    `)
    .eq('id', params.setId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Set not found' }, { status: 404 })
  }

  return NextResponse.json({ set: data })
}

// PATCH /api/sample-point-sets/[setId] — update set metadata
export async function PATCH(
  request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.status !== undefined) updates.status = body.status
  if (body.style !== undefined) updates.style = body.style

  const { data, error } = await supabase
    .from('sample_point_sets')
    .update(updates)
    .eq('id', params.setId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ set: data })
}

// DELETE /api/sample-point-sets/[setId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const supabase = createServerSupabaseClient()

  // Get trial_id before deleting
  const { data: set } = await supabase
    .from('sample_point_sets')
    .select('trial_id')
    .eq('id', params.setId)
    .single()

  if (!set) {
    return NextResponse.json({ error: 'Set not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('sample_point_sets')
    .delete()
    .eq('id', params.setId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Check if trial has remaining sets
  const { data: remaining } = await supabase
    .from('sample_point_sets')
    .select('id')
    .eq('trial_id', set.trial_id)
    .limit(1)

  if (!remaining || remaining.length === 0) {
    await supabase.from('trial_data_files').upsert({
      trial_id: set.trial_id,
      file_type: 'samplePoints',
      has_data: false,
      last_updated: new Date().toISOString(),
    })
  }

  return NextResponse.json({ status: 'success' })
}
