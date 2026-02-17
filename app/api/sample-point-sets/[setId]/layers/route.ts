import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const maxDuration = 60

// POST /api/sample-point-sets/[setId]/layers — create a data layer with values
export async function POST(
  request: NextRequest,
  { params }: { params: { setId: string } }
) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()

  const { name, unit, source, source_metadata, values } = body

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Verify set exists
  const { data: set } = await supabase
    .from('sample_point_sets')
    .select('id')
    .eq('id', params.setId)
    .single()

  if (!set) {
    return NextResponse.json({ error: 'Point set not found' }, { status: 404 })
  }

  // Create the layer
  const { data: layer, error: layerError } = await supabase
    .from('point_data_layers')
    .insert({
      set_id: params.setId,
      name,
      unit: unit || null,
      source: source || 'manual',
      source_metadata: source_metadata || null,
    })
    .select()
    .single()

  if (layerError) {
    return NextResponse.json({ error: layerError.message }, { status: 500 })
  }

  // Insert values if provided
  // values: [{ point_id, value?, text_value? }, ...]
  if (Array.isArray(values) && values.length > 0) {
    const dataValues = values.map((v: any) => ({
      layer_id: layer.id,
      point_id: v.point_id,
      value: v.value ?? null,
      text_value: v.text_value ?? null,
      raw_data: v.raw_data ?? null,
    }))

    const { error: valuesError } = await supabase
      .from('point_data_values')
      .insert(dataValues)

    if (valuesError) {
      return NextResponse.json({ error: valuesError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ layer })
}
