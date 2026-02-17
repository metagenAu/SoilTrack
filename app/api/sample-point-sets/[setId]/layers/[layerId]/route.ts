import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// PATCH /api/sample-point-sets/[setId]/layers/[layerId] — update layer + values
export async function PATCH(
  request: NextRequest,
  { params }: { params: { setId: string; layerId: string } }
) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()

  // Update layer metadata
  const updates: Record<string, any> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.unit !== undefined) updates.unit = body.unit
  if (body.source !== undefined) updates.source = body.source
  if (body.source_metadata !== undefined) updates.source_metadata = body.source_metadata

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('point_data_layers')
      .update(updates)
      .eq('id', params.layerId)
      .eq('set_id', params.setId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Upsert values if provided
  if (Array.isArray(body.values)) {
    for (const v of body.values) {
      await supabase
        .from('point_data_values')
        .upsert(
          {
            layer_id: params.layerId,
            point_id: v.point_id,
            value: v.value ?? null,
            text_value: v.text_value ?? null,
            raw_data: v.raw_data ?? null,
          },
          { onConflict: 'layer_id,point_id' }
        )
    }
  }

  // Fetch updated layer with values
  const { data: layer } = await supabase
    .from('point_data_layers')
    .select('*, point_data_values(*)')
    .eq('id', params.layerId)
    .single()

  return NextResponse.json({ layer })
}

// DELETE /api/sample-point-sets/[setId]/layers/[layerId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { setId: string; layerId: string } }
) {
  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('point_data_layers')
    .delete()
    .eq('id', params.layerId)
    .eq('set_id', params.setId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'success' })
}
