import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth, safeErrorResponse } from '@/lib/api-utils'
import { canUpload, canModify } from '@/lib/auth'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('field_annotations')
    .select('*')
    .eq('field_id', params.id)
    .order('created_at')

  if (error) return safeErrorResponse(error, 'GET /api/fields/[id]/annotations')
  return NextResponse.json(data)
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canUpload(auth.role)) {
    return NextResponse.json({ error: 'Upload permission required' }, { status: 403 })
  }

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

  if (error) return safeErrorResponse(error, 'POST /api/fields/[id]/annotations')
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  request: Request,
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canModify(auth.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

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

  if (error) return safeErrorResponse(error, 'DELETE /api/fields/[id]/annotations')
  return NextResponse.json({ ok: true })
}
