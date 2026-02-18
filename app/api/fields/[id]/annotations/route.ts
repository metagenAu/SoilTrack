import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('field_annotations')
    .select('*')
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

  const { label, annotation_type, geojson, style } = body

  if (!annotation_type || !geojson) {
    return NextResponse.json({ error: 'annotation_type and geojson are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('field_annotations')
    .insert({
      field_id: params.id,
      label: label || '',
      annotation_type,
      geojson,
      style: style || undefined,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  request: Request,
) {
  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const annotationId = searchParams.get('annotation_id')

  if (!annotationId) {
    return NextResponse.json({ error: 'annotation_id query param required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('field_annotations')
    .delete()
    .eq('id', annotationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
