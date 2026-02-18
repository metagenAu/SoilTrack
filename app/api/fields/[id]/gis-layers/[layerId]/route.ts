import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(
  request: Request,
  { params }: { params: { id: string; layerId: string } }
) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if ('name' in body) updates.name = body.name
  if ('style' in body) updates.style = body.style

  const { data, error } = await supabase
    .from('field_gis_layers')
    .update(updates)
    .eq('id', params.layerId)
    .eq('field_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; layerId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('field_gis_layers')
    .delete()
    .eq('id', params.layerId)
    .eq('field_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
