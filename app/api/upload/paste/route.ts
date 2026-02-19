import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { runPipeline, parseRawContent } from '@/lib/upload-pipeline'
import { COLUMN_MAPS, extractTrialId } from '@/lib/parsers/column-maps'
import { getUserRole, canUpload } from '@/lib/auth'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const { role } = await getUserRole()
  if (!canUpload(role)) {
    return NextResponse.json({ status: 'error', detail: 'Upload permission required' }, { status: 403 })
  }
  let supabase: ReturnType<typeof createServerSupabaseClient>
  let body: any

  try {
    supabase = createServerSupabaseClient()
    body = await request.json()
  } catch (err: any) {
    console.error('Paste upload init error:', err)
    return NextResponse.json({ status: 'error', detail: 'Failed to read request data' }, { status: 400 })
  }

  let { trialId, dataType, csvText, assayType } = body

  if (!dataType || !csvText) {
    return NextResponse.json({ status: 'error', detail: 'Missing required fields' }, { status: 400 })
  }

  // Auto-detect trial ID from pasted data when not provided
  if (!trialId) {
    const config = COLUMN_MAPS[dataType]
    if (config) {
      const { rows } = parseRawContent(csvText, false)
      const detected = extractTrialId(rows, config)
      if (detected) {
        trialId = detected
        await supabase.from('trials').upsert(
          { id: detected, name: detected },
          { onConflict: 'id', ignoreDuplicates: true }
        )
      }
    }
  }

  if (!trialId) {
    return NextResponse.json({ status: 'error', detail: 'Missing trial ID — select a trial or ensure the data contains a grower/property/trial column' }, { status: 400 })
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
    console.error('Paste upload error:', err)
    try {
      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: 'paste-import',
        file_type: dataType,
        status: 'error',
        detail: err?.message,
      })
    } catch (logErr) { console.error('upload_log insert failed:', logErr) }
    return NextResponse.json({ status: 'error', detail: 'Import failed. Please check the data format and try again.' })
  }
}
