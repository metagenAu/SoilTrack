import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyFile } from '@/lib/parsers/classify'
import { parseTrialSummary } from '@/lib/parsers/parseTrialSummary'
import { parseSoilHealth } from '@/lib/parsers/parseSoilHealth'
import { parseSoilChemistry } from '@/lib/parsers/parseSoilChemistry'
import { parsePlotData } from '@/lib/parsers/parsePlotData'
import { parseTissueChemistry } from '@/lib/parsers/parseTissueChemistry'
import { parseSampleMetadata } from '@/lib/parsers/parseSampleMetadata'

export const maxDuration = 60

interface FileResult {
  filename: string
  type: string
  status: 'success' | 'error'
  detail?: string
  records?: number
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const formData = await request.formData()
  const files = formData.getAll('files') as File[]

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const results: FileResult[] = []
  let trialId: string | null = null

  // Sort files so trial summary comes first
  const sorted = [...files].sort((a, b) => {
    const aType = classifyFile(a.name)
    const bType = classifyFile(b.name)
    if (aType === 'trialSummary') return -1
    if (bType === 'trialSummary') return 1
    return 0
  })

  for (const file of sorted) {
    const classification = classifyFile(file.name)

    try {
      if (classification === 'trialSummary') {
        const buffer = await file.arrayBuffer()
        const parsed = parseTrialSummary(buffer)
        trialId = parsed.metadata.id

        // Upsert trial
        const { error: trialError } = await supabase
          .from('trials')
          .upsert({
            id: parsed.metadata.id,
            name: parsed.metadata.name || `Trial ${parsed.metadata.id}`,
            grower: parsed.metadata.grower,
            location: parsed.metadata.location,
            gps: parsed.metadata.gps,
            crop: parsed.metadata.crop,
            trial_type: parsed.metadata.trial_type,
            contact: parsed.metadata.contact,
            planting_date: parsed.metadata.planting_date,
            harvest_date: parsed.metadata.harvest_date,
            num_treatments: parsed.metadata.num_treatments,
            reps: parsed.metadata.reps,
          })

        if (trialError) throw trialError

        // Insert treatments
        if (parsed.treatments.length > 0) {
          // Delete existing treatments first
          await supabase.from('treatments').delete().eq('trial_id', parsed.metadata.id)

          const { error: trtError } = await supabase.from('treatments').insert(
            parsed.treatments.map((t, i) => ({
              trial_id: parsed.metadata.id,
              trt_number: t.trt_number,
              application: t.application,
              fertiliser: t.fertiliser,
              product: t.product,
              rate: t.rate,
              timing: t.timing,
              sort_order: i + 1,
            }))
          )
          if (trtError) throw trtError
        }

        results.push({
          filename: file.name,
          type: 'Trial Summary',
          status: 'success',
          detail: `Trial ${parsed.metadata.id} created/updated`,
          records: parsed.treatments.length,
        })

        // Log
        await supabase.from('upload_log').insert({
          trial_id: parsed.metadata.id,
          filename: file.name,
          file_type: 'trialSummary',
          status: 'success',
          detail: `Trial created with ${parsed.treatments.length} treatments`,
          records_imported: parsed.treatments.length,
        })

      } else if (classification === 'soilHealth') {
        const text = await file.text()
        const rows = parseSoilHealth(text)
        const targetTrialId = trialId

        if (!targetTrialId) {
          results.push({ filename: file.name, type: 'Soil Health', status: 'error', detail: 'No trial context' })
          continue
        }

        const { error } = await supabase.from('soil_health_samples').insert(
          rows.map(r => ({ trial_id: targetTrialId, ...r }))
        )
        if (error) throw error

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'soilHealth', has_data: true, last_updated: new Date().toISOString(),
        })

        await supabase.from('upload_log').insert({
          trial_id: targetTrialId, filename: file.name, file_type: 'soilHealth',
          status: 'success', records_imported: rows.length,
        })

        results.push({ filename: file.name, type: 'Soil Health', status: 'success', records: rows.length })

      } else if (classification === 'soilChemistry') {
        const text = await file.text()
        const rows = parseSoilChemistry(text)
        const targetTrialId = trialId

        if (!targetTrialId) {
          results.push({ filename: file.name, type: 'Soil Chemistry', status: 'error', detail: 'No trial context' })
          continue
        }

        const { error } = await supabase.from('soil_chemistry').insert(
          rows.map(r => ({ trial_id: targetTrialId, ...r }))
        )
        if (error) throw error

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'soilChemistry', has_data: true, last_updated: new Date().toISOString(),
        })

        await supabase.from('upload_log').insert({
          trial_id: targetTrialId, filename: file.name, file_type: 'soilChemistry',
          status: 'success', records_imported: rows.length,
        })

        results.push({ filename: file.name, type: 'Soil Chemistry', status: 'success', records: rows.length })

      } else if (classification === 'plotData') {
        const text = await file.text()
        const rows = parsePlotData(text)
        const targetTrialId = trialId

        if (!targetTrialId) {
          results.push({ filename: file.name, type: 'Plot Data', status: 'error', detail: 'No trial context' })
          continue
        }

        const { error } = await supabase.from('plot_data').insert(
          rows.map(r => ({ trial_id: targetTrialId, ...r }))
        )
        if (error) throw error

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'plotData', has_data: true, last_updated: new Date().toISOString(),
        })

        await supabase.from('upload_log').insert({
          trial_id: targetTrialId, filename: file.name, file_type: 'plotData',
          status: 'success', records_imported: rows.length,
        })

        results.push({ filename: file.name, type: 'Plot Data', status: 'success', records: rows.length })

      } else if (classification === 'tissueChemistry') {
        const buffer = await file.arrayBuffer()
        const rows = parseTissueChemistry(buffer)
        const targetTrialId = trialId

        if (!targetTrialId) {
          results.push({ filename: file.name, type: 'Tissue Chemistry', status: 'error', detail: 'No trial context' })
          continue
        }

        const { error } = await supabase.from('tissue_chemistry').insert(
          rows.map(r => ({ trial_id: targetTrialId, ...r }))
        )
        if (error) throw error

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'tissueChemistry', has_data: true, last_updated: new Date().toISOString(),
        })

        await supabase.from('upload_log').insert({
          trial_id: targetTrialId, filename: file.name, file_type: 'tissueChemistry',
          status: 'success', records_imported: rows.length,
        })

        results.push({ filename: file.name, type: 'Tissue Chemistry', status: 'success', records: rows.length })

      } else if (classification === 'sampleMetadata') {
        const text = await file.text()
        const rows = parseSampleMetadata(text)
        const targetTrialId = trialId

        if (!targetTrialId) {
          results.push({ filename: file.name, type: 'Assay Results', status: 'error', detail: 'No trial context' })
          continue
        }

        const { error } = await supabase.from('sample_metadata').insert(
          rows.map(r => ({ trial_id: targetTrialId, ...r }))
        )
        if (error) throw error

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'sampleMetadata', has_data: true, last_updated: new Date().toISOString(),
        })

        await supabase.from('upload_log').insert({
          trial_id: targetTrialId, filename: file.name, file_type: 'sampleMetadata',
          status: 'success', records_imported: rows.length,
        })

        results.push({ filename: file.name, type: 'Assay Results', status: 'success', records: rows.length })

      } else if (classification === 'photo') {
        results.push({ filename: file.name, type: 'Photo', status: 'success', detail: 'Skipped (photo storage not yet configured)' })
      } else {
        // Skip unrecognized files silently (e.g. READMEs, system files)
        results.push({ filename: file.name, type: 'Unknown', status: 'success', detail: 'Skipped — not a recognised data file' })
      }
    } catch (err: any) {
      results.push({
        filename: file.name,
        type: classification,
        status: 'error',
        detail: err.message || 'Processing failed',
      })

      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: file.name,
        file_type: classification,
        status: 'error',
        detail: err.message || 'Processing failed',
      })
    }
  }

  return NextResponse.json({ results, trialId })
}
