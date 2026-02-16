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

  const { trialId, dataType, csvText } = body

  if (!trialId || !dataType || !csvText) {
    return NextResponse.json({ status: 'error', detail: 'Missing required fields' }, { status: 400 })
  }

  try {
    const extraDefaults: Record<string, any> = {}
    if (dataType === 'sampleMetadata') {
      extraDefaults.assay_type = assayType || 'general'
    }

    try {
      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: 'paste-import',
        file_type: dataType,
        status: 'success',
        detail: 'Pasted CSV data',
        records_imported: records,
      })
    } catch { /* logging is best-effort */ }

    return NextResponse.json({ status: 'success', detail: `Imported ${records} records`, records })
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
