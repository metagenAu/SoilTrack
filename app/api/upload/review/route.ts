import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { reprocessRawUpload } from '@/lib/upload-pipeline'
import { getUserRole, canUpload } from '@/lib/auth'
import { requireAuth } from '@/lib/api-utils'

export const maxDuration = 60

/**
 * GET /api/upload/review?id=<rawUploadId>
 * Fetch a pending raw_upload so the UI can show unmapped columns for review.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response

  const supabase = createServerSupabaseClient()
  const rawUploadId = request.nextUrl.searchParams.get('id')

  if (!rawUploadId) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('raw_uploads')
    .select('*')
    .eq('id', rawUploadId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/upload/review
 * Submit column mapping overrides for a pending raw_upload and re-process it.
 *
 * Body: { rawUploadId: string, columnOverrides: Record<string, string> }
 *
 * columnOverrides maps source column names to DB field names, e.g.:
 *   { "my_yield_col": "yield_t_ha", "extra_col": "__skip__" }
 */
export async function POST(request: NextRequest) {
  const { role } = await getUserRole()
  if (!canUpload(role)) {
    return NextResponse.json({ status: 'error', detail: 'Upload permission required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const body = await request.json()
  const { rawUploadId, columnOverrides } = body

  if (!rawUploadId || !columnOverrides) {
    return NextResponse.json(
      { status: 'error', detail: 'Missing rawUploadId or columnOverrides' },
      { status: 400 }
    )
  }

  const result = await reprocessRawUpload(supabase, rawUploadId, columnOverrides)

  return NextResponse.json({
    status: result.status,
    detail: result.detail,
    records: result.records,
    rawUploadId: result.rawUploadId,
  })
}
