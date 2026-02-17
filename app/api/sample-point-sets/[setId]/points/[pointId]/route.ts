import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// PATCH /api/sample-point-sets/[setId]/points/[pointId] — update a single point
export async function PATCH(
  request: NextRequest,
  { params }: { params: { setId: string; pointId: string } }
) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()

  const updates: Record<string, any> = {}
  if (body.label !== undefined) updates.label = body.label
  if (body.latitude !== undefined) updates.latitude = body.latitude
  if (body.longitude !== undefined) updates.longitude = body.longitude
  if (body.notes !== undefined) updates.notes = body.notes
  if (body.properties !== undefined) updates.properties = body.properties
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order

  const { data, error } = await supabase
    .from('sample_points')
    .update(updates)
    .eq('id', params.pointId)
    .eq('set_id', params.setId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ point: data })
}

// DELETE /api/sample-point-sets/[setId]/points/[pointId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { setId: string; pointId: string } }
) {
  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('sample_points')
    .delete()
    .eq('id', params.pointId)
    .eq('set_id', params.setId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'success' })
}
