import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { parseSoilHealth } from '@/lib/parsers/parseSoilHealth'
import { parseSoilChemistry } from '@/lib/parsers/parseSoilChemistry'
import { parsePlotData } from '@/lib/parsers/parsePlotData'

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { trialId, dataType, csvText } = await request.json()

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

    } else {
      return NextResponse.json({ status: 'error', detail: 'Unsupported data type for paste' })
    }

    await supabase.from('upload_log').insert({
      trial_id: trialId,
      filename: 'paste-import',
      file_type: dataType,
      status: 'success',
      detail: 'Pasted CSV data',
      records_imported: records,
    })

    return NextResponse.json({ status: 'success', detail: `Imported ${records} records`, records })
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
