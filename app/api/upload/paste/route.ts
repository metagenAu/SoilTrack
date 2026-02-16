import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { runPipeline } from '@/lib/upload-pipeline'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  let supabase: ReturnType<typeof createServerSupabaseClient>
  let body: any

  try {
    supabase = createServerSupabaseClient()
    body = await request.json()
  } catch (err: any) {
    return NextResponse.json({ status: 'error', detail: err?.message || 'Failed to read request data' }, { status: 400 })
  }

  const { trialId, dataType, csvText, assayType } = body

  if (!trialId || !dataType || !csvText) {
    return NextResponse.json({ status: 'error', detail: 'Missing required fields' }, { status: 400 })
  }

  try {
    const extraDefaults: Record<string, any> = {}
    if (dataType === 'sampleMetadata') {
      extraDefaults.assay_type = assayType || 'general'
    }

    const result = await runPipeline(
      supabase,
      trialId,
      dataType,
      'paste-import',
      csvText,
      false,
      { extraDefaults },
    )

    try {
      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: 'paste-import',
        file_type: dataType,
        status: result.status === 'success' ? 'success' : 'error',
        detail: result.detail || 'Pasted CSV data',
        records_imported: result.records,
      })
    } catch { /* logging is best-effort */ }

    return NextResponse.json(result)
  } catch (err: any) {
    try {
      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: 'paste-import',
        file_type: dataType,
        status: 'error',
        detail: err?.message,
      })
    } catch { /* logging is best-effort */ }
    return NextResponse.json({ status: 'error', detail: err?.message || 'Import failed' })
  }
}
