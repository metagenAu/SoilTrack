import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { runPipeline } from '@/lib/upload-pipeline'

export const maxDuration = 60

/**
 * GET /api/metadata?trialId=...&assayType=...
 * Query sample metadata by trial and optionally by assay type
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const trialId = request.nextUrl.searchParams.get('trialId')
  const assayType = request.nextUrl.searchParams.get('assayType')

  if (!trialId) {
    return NextResponse.json({ error: 'Missing trialId' }, { status: 400 })
  }

  let query = supabase.from('sample_metadata').select('*').eq('trial_id', trialId)
  if (assayType) {
    query = query.eq('assay_type', assayType)
  }

  const { data, error } = await query.order('sample_no')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/metadata
 * Programmatic JSON API to insert sample metadata.
 *
 * Body (JSON):
 *   { trialId: string, assayType: string, records: MetadataRecord[] }
 *   or { trialId: string, assayType: string, csvText: string }
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()

  const contentType = request.headers.get('content-type') || ''

  // Handle JSON body (programmatic API)
  if (contentType.includes('application/json')) {
    const body = await request.json()
    const { trialId, assayType, records, csvText } = body

    if (!trialId) {
      return NextResponse.json({ status: 'error', detail: 'Missing trialId' }, { status: 400 })
    }

    try {
      if (csvText) {
        // Use the pipeline for CSV text
        const result = await runPipeline(
          supabase,
          trialId,
          'sampleMetadata',
          'api-import',
          csvText,
          false,
          { extraDefaults: { assay_type: assayType || 'general' } }
        )

        return NextResponse.json({
          status: result.status,
          detail: result.detail,
          records: result.records,
        })
      } else if (records && Array.isArray(records)) {
        // Direct records insertion — still goes through load_and_track RPC for dedup + tracking
        const rowsToInsert = records.map((r: any) => ({
          assay_type: r.assay_type || assayType || 'general',
          sample_no: r.sample_no || '',
          date: r.date || null,
          block: r.block || '',
          treatment: r.treatment != null ? parseInt(r.treatment, 10) : null,
          metric: r.metric,
          value: r.value != null ? parseFloat(r.value) : null,
          unit: r.unit || '',
          raw_data: r.raw_data || null,
        }))

        if (rowsToInsert.length === 0) {
          return NextResponse.json({ status: 'error', detail: 'No valid records found' }, { status: 400 })
        }

        const { data: rpcResult, error: rpcError } = await supabase.rpc('load_and_track', {
          p_table_name: 'sample_metadata',
          p_trial_id: trialId,
          p_file_type: 'sampleMetadata',
          p_filename: 'api-import',
          p_rows: rowsToInsert,
        })

        if (rpcError) throw rpcError
        const result = rpcResult as { status: string; records?: number; detail?: string }

        return NextResponse.json({
          status: result.status,
          detail: result.detail || `Imported ${result.records} metadata records`,
          records: result.records,
        })
      } else {
        return NextResponse.json({
          status: 'error',
          detail: 'Provide either "records" array or "csvText" string',
        }, { status: 400 })
      }
    } catch (err: any) {
      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: 'api-import',
        file_type: 'sampleMetadata',
        status: 'error',
        detail: err.message,
      })
      return NextResponse.json({ status: 'error', detail: err.message || 'Import failed' })
    }
  }

  // Handle FormData (file upload)
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const trialId = formData.get('trialId') as string
    const assayType = formData.get('assayType') as string

    if (!file || !trialId) {
      return NextResponse.json({ status: 'error', detail: 'Missing file or trialId' }, { status: 400 })
    }

    try {
      const text = await file.text()
      const result = await runPipeline(
        supabase,
        trialId,
        'sampleMetadata',
        file.name,
        text,
        false,
        { extraDefaults: { assay_type: assayType || 'general' } }
      )

      return NextResponse.json({
        status: result.status,
        detail: result.detail,
        records: result.records,
      })
    } catch (err: any) {
      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: file?.name || 'unknown',
        file_type: 'sampleMetadata',
        status: 'error',
        detail: err.message,
      })
      return NextResponse.json({ status: 'error', detail: err.message || 'Import failed' })
    }
  }

  return NextResponse.json({ status: 'error', detail: 'Unsupported content type' }, { status: 400 })
}

/**
 * DELETE /api/metadata?trialId=...&assayType=...
 * Delete metadata for a trial (optionally filtered by assay type)
 */
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const trialId = request.nextUrl.searchParams.get('trialId')
  const assayType = request.nextUrl.searchParams.get('assayType')

  if (!trialId) {
    return NextResponse.json({ error: 'Missing trialId' }, { status: 400 })
  }

  let query = supabase.from('sample_metadata').delete().eq('trial_id', trialId)
  if (assayType) {
    query = query.eq('assay_type', assayType)
  }

  const { error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'success', detail: 'Metadata deleted' })
}
