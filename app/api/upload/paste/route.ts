import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { parseSoilHealth } from '@/lib/parsers/parseSoilHealth'
import { parseSoilChemistry } from '@/lib/parsers/parseSoilChemistry'
import { parsePlotData } from '@/lib/parsers/parsePlotData'
import { parseSampleMetadata } from '@/lib/parsers/parseSampleMetadata'

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
    let records = 0

    if (dataType === 'soilHealth') {
      const rows = parseSoilHealth(csvText)
      await supabase.from('soil_health_samples').insert(rows.map(r => ({ trial_id: trialId, ...r })))
      await supabase.from('trial_data_files').upsert({ trial_id: trialId, file_type: 'soilHealth', has_data: true })
      records = rows.length

    } else if (dataType === 'soilChemistry') {
      const rows = parseSoilChemistry(csvText)
      await supabase.from('soil_chemistry').insert(rows.map(r => ({ trial_id: trialId, ...r })))
      await supabase.from('trial_data_files').upsert({ trial_id: trialId, file_type: 'soilChemistry', has_data: true })
      records = rows.length

    } else if (dataType === 'plotData') {
      const rows = parsePlotData(csvText)
      await supabase.from('plot_data').insert(rows.map(r => ({ trial_id: trialId, ...r })))
      await supabase.from('trial_data_files').upsert({ trial_id: trialId, file_type: 'plotData', has_data: true })
      records = rows.length

    } else if (dataType === 'sampleMetadata') {
      const rows = parseSampleMetadata(csvText, body.assayType || 'general')
      await supabase.from('sample_metadata').insert(rows.map(r => ({ trial_id: trialId, ...r })))
      await supabase.from('trial_data_files').upsert({ trial_id: trialId, file_type: 'sampleMetadata', has_data: true })
      records = rows.length

    } else {
      return NextResponse.json({ status: 'error', detail: 'Unsupported data type for paste' })
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
