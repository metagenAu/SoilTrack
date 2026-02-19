import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth, safeErrorResponse } from '@/lib/api-utils'
import { canUpload } from '@/lib/auth'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('field_gis_layers')
    .select('*')
    .eq('field_id', params.id)
    .order('created_at')

  if (error) return safeErrorResponse(error, 'GET /api/fields/[id]/gis-layers')
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

  const { name, file_type, geojson, style } = body

  if (!name || !file_type || !geojson) {
    return NextResponse.json(
      { error: 'name, file_type, and geojson are required' },
      { status: 400 }
    )
  }

  const featureCount = geojson?.features?.length || 0

  const { data, error } = await supabase
    .from('field_gis_layers')
    .insert({
      field_id: params.id,
      name,
      file_type,
      geojson,
      feature_count: featureCount,
      style: style || undefined,
    })
    .select()
    .single()

  if (error) return safeErrorResponse(error, 'POST /api/fields/[id]/gis-layers')
  return NextResponse.json(data, { status: 201 })
}
