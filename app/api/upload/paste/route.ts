import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { runPipeline } from '@/lib/upload-pipeline'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()
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
      { extraDefaults: Object.keys(extraDefaults).length > 0 ? extraDefaults : undefined }
    )

    return NextResponse.json({
      status: result.status,
      detail: result.detail,
      records: result.records,
      rawUploadId: result.rawUploadId,
      unmappedColumns: result.unmappedColumns,
    })
  } catch (err: any) {
    await supabase.from('upload_log').insert({
      trial_id: trialId,
      filename: 'paste-import',
      file_type: dataType,
      status: 'error',
      detail: err.message,
    })
    return NextResponse.json({ status: 'error', detail: err.message || 'Import failed' })
  }
}
