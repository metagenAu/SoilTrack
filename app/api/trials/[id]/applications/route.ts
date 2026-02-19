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
    .from('trial_applications')
    .select('*')
    .eq('trial_id', params.id)
    .order('created_at')

  if (error) return safeErrorResponse(error, 'GET /api/trials/[id]/applications')
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

  const { name, trt_number, application_type, product, rate, date_applied, geojson, geojson_source, style, notes } = body

  if (!name || !geojson) {
    return NextResponse.json(
      { error: 'name and geojson are required' },
      { status: 400 }
    )
  }

  // Validate geojson structure
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    return NextResponse.json(
      { error: 'geojson must be a valid GeoJSON FeatureCollection' },
      { status: 400 }
    )
  }

  // Verify trial exists
  const { data: trial } = await supabase.from('trials').select('id').eq('id', params.id).single()
  if (!trial) {
    return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
  }

  const featureCount = geojson.features.length

  const { data, error } = await supabase
    .from('trial_applications')
    .insert({
      trial_id: params.id,
      name,
      trt_number: trt_number || null,
      application_type: application_type || null,
      product: product || null,
      rate: rate || null,
      date_applied: date_applied || null,
      geojson,
      geojson_source: geojson_source || null,
      feature_count: featureCount,
      style: style || undefined,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return safeErrorResponse(error, 'POST /api/trials/[id]/applications')
  return NextResponse.json(data, { status: 201 })
}
