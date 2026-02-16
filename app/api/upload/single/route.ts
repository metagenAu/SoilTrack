import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyFile } from '@/lib/parsers/classify'
import { parseTrialSummary } from '@/lib/parsers/parseTrialSummary'
import { parseSoilHealth } from '@/lib/parsers/parseSoilHealth'
import { parseSoilChemistry } from '@/lib/parsers/parseSoilChemistry'
import { parsePlotData } from '@/lib/parsers/parsePlotData'
import { parseTissueChemistry } from '@/lib/parsers/parseTissueChemistry'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const trialId = formData.get('trialId') as string
  const fileType = formData.get('fileType') as string

  if (!file || !trialId) {
    return NextResponse.json({ status: 'error', detail: 'Missing file or trial ID' }, { status: 400 })
  }

  const classification = fileType === 'auto' ? classifyFile(file.name) : fileType

  try {
    let records = 0

    if (classification === 'trialSummary') {
      const buffer = await file.arrayBuffer()
      const parsed = parseTrialSummary(buffer)

      await supabase.from('trials').update({
        name: parsed.metadata.name || undefined,
        grower: parsed.metadata.grower || undefined,
        location: parsed.metadata.location || undefined,
        gps: parsed.metadata.gps || undefined,
        crop: parsed.metadata.crop || undefined,
        trial_type: parsed.metadata.trial_type || undefined,
        contact: parsed.metadata.contact || undefined,
        planting_date: parsed.metadata.planting_date || undefined,
        harvest_date: parsed.metadata.harvest_date || undefined,
        num_treatments: parsed.metadata.num_treatments || undefined,
        reps: parsed.metadata.reps || undefined,
      }).eq('id', trialId)

      if (parsed.treatments.length > 0) {
        await supabase.from('treatments').delete().eq('trial_id', trialId)
        await supabase.from('treatments').insert(
          parsed.treatments.map((t, i) => ({
            trial_id: trialId,
            trt_number: t.trt_number,
            application: t.application,
            fertiliser: t.fertiliser,
            product: t.product,
            rate: t.rate,
            timing: t.timing,
            sort_order: i + 1,
          }))
        )
      }
      records = parsed.treatments.length

    } else if (classification === 'soilHealth') {
      const text = await file.text()
      const rows = parseSoilHealth(text)
      await supabase.from('soil_health_samples').insert(rows.map(r => ({ trial_id: trialId, ...r })))
      await supabase.from('trial_data_files').upsert({ trial_id: trialId, file_type: 'soilHealth', has_data: true })
      records = rows.length

    } else if (classification === 'soilChemistry') {
      const text = await file.text()
      const rows = parseSoilChemistry(text)
      await supabase.from('soil_chemistry').insert(rows.map(r => ({ trial_id: trialId, ...r })))
      await supabase.from('trial_data_files').upsert({ trial_id: trialId, file_type: 'soilChemistry', has_data: true })
      records = rows.length

    } else if (classification === 'plotData') {
      const text = await file.text()
      const rows = parsePlotData(text)
      await supabase.from('plot_data').insert(rows.map(r => ({ trial_id: trialId, ...r })))
      await supabase.from('trial_data_files').upsert({ trial_id: trialId, file_type: 'plotData', has_data: true })
      records = rows.length

    } else if (classification === 'tissueChemistry') {
      const buffer = await file.arrayBuffer()
      const rows = parseTissueChemistry(buffer)
      await supabase.from('tissue_chemistry').insert(rows.map(r => ({ trial_id: trialId, ...r })))
      await supabase.from('trial_data_files').upsert({ trial_id: trialId, file_type: 'tissueChemistry', has_data: true })
      records = rows.length

    } else {
      return NextResponse.json({ status: 'error', detail: 'Unrecognized file type' })
    }

    await supabase.from('upload_log').insert({
      trial_id: trialId,
      filename: file.name,
      file_type: classification,
      status: 'success',
      records_imported: records,
    })

    return NextResponse.json({ status: 'success', detail: `Imported successfully`, records })
  } catch (err: any) {
    await supabase.from('upload_log').insert({
      trial_id: trialId,
      filename: file.name,
      file_type: classification,
      status: 'error',
      detail: err.message,
    })
    return NextResponse.json({ status: 'error', detail: err.message || 'Processing failed' })
  }
}
