import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { parseSampleMetadata } from '@/lib/parsers/parseSampleMetadata'

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
 *
 * Where MetadataRecord = { sample_no, date?, block?, treatment?, metric, value, unit? }
 *
 * Or alternatively, upload CSV text:
 *   { trialId: string, assayType: string, csvText: string }
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
      let rowsToInsert: any[] = []

      if (csvText) {
        // Parse CSV text
        const parsed = parseSampleMetadata(csvText, assayType || 'general')
        rowsToInsert = parsed.map(r => ({ trial_id: trialId, ...r }))
      } else if (records && Array.isArray(records)) {
        // Direct records insertion
        rowsToInsert = records.map((r: any) => ({
          trial_id: trialId,
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
      } else {
        return NextResponse.json({
          status: 'error',
          detail: 'Provide either "records" array or "csvText" string',
        }, { status: 400 })
      }

      if (rowsToInsert.length === 0) {
        return NextResponse.json({ status: 'error', detail: 'No valid records found' }, { status: 400 })
      }

      const { error } = await supabase.from('sample_metadata').insert(rowsToInsert)
      if (error) throw error

      await supabase.from('trial_data_files').upsert({
        trial_id: trialId,
        file_type: 'sampleMetadata',
        has_data: true,
      })

      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: 'api-import',
        file_type: 'sampleMetadata',
        status: 'success',
        detail: `Programmatic import: ${assayType || 'general'}`,
        records_imported: rowsToInsert.length,
      })

      return NextResponse.json({
        status: 'success',
        detail: `Imported ${rowsToInsert.length} metadata records`,
        records: rowsToInsert.length,
      })
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
      const parsed = parseSampleMetadata(text, assayType || 'general')
      const rowsToInsert = parsed.map(r => ({ trial_id: trialId, ...r }))

      if (rowsToInsert.length === 0) {
        return NextResponse.json({ status: 'error', detail: 'No valid records found in file' })
      }

      const { error } = await supabase.from('sample_metadata').insert(rowsToInsert)
      if (error) throw error

      await supabase.from('trial_data_files').upsert({
        trial_id: trialId,
        file_type: 'sampleMetadata',
        has_data: true,
      })

      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: file.name,
        file_type: 'sampleMetadata',
        status: 'success',
        detail: `File upload: ${assayType || 'general'}`,
        records_imported: rowsToInsert.length,
      })

      return NextResponse.json({
        status: 'success',
        detail: `Imported ${rowsToInsert.length} metadata records`,
        records: rowsToInsert.length,
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
