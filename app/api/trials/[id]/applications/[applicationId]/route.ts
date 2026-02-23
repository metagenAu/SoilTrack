import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth, safeErrorResponse } from '@/lib/api-utils'
import { canUpload } from '@/lib/auth'

const VALID_SOURCES = new Set(['drawn', 'kml', 'kmz', 'shapefile', 'geojson'])
const VALID_APP_TYPES = new Set(['fertiliser', 'herbicide', 'fungicide', 'insecticide', 'seed', 'lime', 'gypsum', 'other'])

export async function PUT(
  request: Request,
  { params }: { params: { id: string; applicationId: string } }
) {
  try {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response
    if (!canUpload(auth.role)) {
      return NextResponse.json({ error: 'Upload permission required' }, { status: 403 })
    }

    const supabase = createServerSupabaseClient()
    const body = await request.json()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const allowedFields = ['name', 'trt_number', 'application_type', 'product', 'rate', 'date_applied', 'geojson', 'geojson_source', 'style', 'notes']
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    // Sanitise enum values so they don't violate CHECK constraints
    if (typeof updates.geojson_source === 'string' && !VALID_SOURCES.has(updates.geojson_source)) {
      updates.geojson_source = null
    }
    if (typeof updates.application_type === 'string' && !VALID_APP_TYPES.has(updates.application_type)) {
      updates.application_type = null
    }

    // Recalculate feature_count if geojson was updated
    if (updates.geojson) {
      const gj = updates.geojson as any
      if (gj.type === 'FeatureCollection' && Array.isArray(gj.features)) {
        updates.feature_count = gj.features.length
      }
    }

    const { data, error } = await supabase
      .from('trial_applications')
      .update(updates)
      .eq('id', params.applicationId)
      .eq('trial_id', params.id)
      .select()
      .single()

    if (error) {
      console.error('[PUT /api/trials/[id]/applications/[applicationId]] DB error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      return safeErrorResponse(error, 'PUT /api/trials/[id]/applications/[applicationId]')
    }
    if (!data) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err) {
    return safeErrorResponse(err, 'PUT /api/trials/[id]/applications/[applicationId] (unhandled)')
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; applicationId: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canUpload(auth.role)) {
    return NextResponse.json({ error: 'Upload permission required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('trial_applications')
    .delete()
    .eq('id', params.applicationId)
    .eq('trial_id', params.id)

  if (error) return safeErrorResponse(error, 'DELETE /api/trials/[id]/applications/[applicationId]')
  return NextResponse.json({ status: 'deleted' })
}
