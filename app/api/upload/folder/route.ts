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
  let supabase: ReturnType<typeof createServerSupabaseClient>
  let files: File[]

  try {
    supabase = createServerSupabaseClient()
    const formData = await request.formData()
    files = formData.getAll('files') as File[]
  } catch (err: any) {
    console.error('[upload/folder] Init error:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to read upload data', results: [] },
      { status: 400 }
    )
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided', results: [] }, { status: 400 })
  }

  const results: FileResult[] = []
  let trialId: string | null = null

  // Sort files so trial summary comes first
  const sorted = [...files].sort((a, b) => {
    const aType = classifyFile(a.name || '')
    const bType = classifyFile(b.name || '')
    if (aType === 'trialSummary') return -1
    if (bType === 'trialSummary') return 1
    return 0
  })

  for (const file of sorted) {
    try {
      const filename = file.name || 'unnamed'
      const classification = classifyFile(filename)

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
          filename,
          type: 'Trial Summary',
          status: 'success',
          detail: `Trial ${parsed.metadata.id} created/updated`,
          records: parsed.treatments.length,
        })

        // Log (best-effort, don't let logging errors break the upload)
        try {
          await supabase.from('upload_log').insert({
            trial_id: parsed.metadata.id,
            filename,
            file_type: 'trialSummary',
            status: 'success',
            detail: `Trial created with ${parsed.treatments.length} treatments`,
            records_imported: parsed.treatments.length,
          })
        } catch { /* logging is best-effort */ }

      } else if (classification === 'soilHealth') {
        const text = await file.text()
        const rows = parseSoilHealth(text)
        const targetTrialId = trialId

        if (!targetTrialId) {
          results.push({ filename, type: 'Soil Health', status: 'error', detail: 'No trial context — upload a Trial Summary first' })
          continue
        }

        const { error } = await supabase.from('soil_health_samples').insert(
          rows.map(r => ({ trial_id: targetTrialId, ...r }))
        )
        if (error) throw error

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'soilHealth', has_data: true, last_updated: new Date().toISOString(),
        })

        try {
          await supabase.from('upload_log').insert({
            trial_id: targetTrialId, filename, file_type: 'soilHealth',
            status: 'success', records_imported: rows.length,
          })
        } catch { /* logging is best-effort */ }

        results.push({ filename, type: 'Soil Health', status: 'success', records: rows.length })

      } else if (classification === 'soilChemistry') {
        const text = await file.text()
        const rows = parseSoilChemistry(text)
        const targetTrialId = trialId

        if (!targetTrialId) {
          results.push({ filename, type: 'Soil Chemistry', status: 'error', detail: 'No trial context — upload a Trial Summary first' })
          continue
        }

        const { error } = await supabase.from('soil_chemistry').insert(
          rows.map(r => ({ trial_id: targetTrialId, ...r }))
        )
        if (error) throw error

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'soilChemistry', has_data: true, last_updated: new Date().toISOString(),
        })

        try {
          await supabase.from('upload_log').insert({
            trial_id: targetTrialId, filename, file_type: 'soilChemistry',
            status: 'success', records_imported: rows.length,
          })
        } catch { /* logging is best-effort */ }

        results.push({ filename, type: 'Soil Chemistry', status: 'success', records: rows.length })

      } else if (classification === 'plotData') {
        const text = await file.text()
        const rows = parsePlotData(text)
        const targetTrialId = trialId

        if (!targetTrialId) {
          results.push({ filename, type: 'Plot Data', status: 'error', detail: 'No trial context — upload a Trial Summary first' })
          continue
        }

        const { error } = await supabase.from('plot_data').insert(
          rows.map(r => ({ trial_id: targetTrialId, ...r }))
        )
        if (error) throw error

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'plotData', has_data: true, last_updated: new Date().toISOString(),
        })

        try {
          await supabase.from('upload_log').insert({
            trial_id: targetTrialId, filename, file_type: 'plotData',
            status: 'success', records_imported: rows.length,
          })
        } catch { /* logging is best-effort */ }

        results.push({ filename, type: 'Plot Data', status: 'success', records: rows.length })

      } else if (classification === 'tissueChemistry') {
        const buffer = await file.arrayBuffer()
        const rows = parseTissueChemistry(buffer)
        const targetTrialId = trialId

        if (!targetTrialId) {
          results.push({ filename, type: 'Tissue Chemistry', status: 'error', detail: 'No trial context — upload a Trial Summary first' })
          continue
        }

        const { error } = await supabase.from('tissue_chemistry').insert(
          rows.map(r => ({ trial_id: targetTrialId, ...r }))
        )
        if (error) throw error

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'tissueChemistry', has_data: true, last_updated: new Date().toISOString(),
        })

        try {
          await supabase.from('upload_log').insert({
            trial_id: targetTrialId, filename, file_type: 'tissueChemistry',
            status: 'success', records_imported: rows.length,
          })
        } catch { /* logging is best-effort */ }

        results.push({ filename, type: 'Tissue Chemistry', status: 'success', records: rows.length })

      } else if (classification === 'sampleMetadata') {
        const text = await file.text()
        const rows = parseSampleMetadata(text)
        const targetTrialId = trialId

        if (!targetTrialId) {
          results.push({ filename, type: 'Assay Results', status: 'error', detail: 'No trial context — upload a Trial Summary first' })
          continue
        }

        const { error } = await supabase.from('sample_metadata').insert(
          rows.map(r => ({ trial_id: targetTrialId, ...r }))
        )
        if (error) throw error

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'sampleMetadata', has_data: true, last_updated: new Date().toISOString(),
        })

        try {
          await supabase.from('upload_log').insert({
            trial_id: targetTrialId, filename, file_type: 'sampleMetadata',
            status: 'success', records_imported: rows.length,
          })
        } catch { /* logging is best-effort */ }

        results.push({ filename, type: 'Assay Results', status: 'success', records: rows.length })

      } else if (classification === 'photo') {
        const targetTrialId = trialId
        if (!targetTrialId) {
          results.push({ filename, type: 'Photo', status: 'error', detail: 'No trial context — upload a Trial Summary first' })
          continue
        }

        const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
        const storagePath = `${targetTrialId}/${crypto.randomUUID()}.${ext}`

        const buffer = await file.arrayBuffer()
        const { error: storageError } = await supabase.storage
          .from('trial-photos')
          .upload(storagePath, buffer, {
            contentType: file.type || `image/${ext}`,
            upsert: false,
          })

        if (storageError) throw storageError

        const { error: dbError } = await supabase.from('trial_photos').insert({
          trial_id: targetTrialId,
          filename,
          storage_path: storagePath,
        })

        if (dbError) throw dbError

        await supabase.from('trial_data_files').upsert({
          trial_id: targetTrialId, file_type: 'photo', has_data: true, last_updated: new Date().toISOString(),
        })

        try {
          await supabase.from('upload_log').insert({
            trial_id: targetTrialId, filename, file_type: 'photo',
            status: 'success', records_imported: 1,
          })
        } catch { /* logging is best-effort */ }

        results.push({ filename, type: 'Photo', status: 'success', detail: 'Photo uploaded', records: 1 })

      } else {
        // Skip unrecognized files silently (e.g. READMEs, system files)
        results.push({ filename, type: 'Unknown', status: 'success', detail: 'Skipped — not a recognised data file' })
      }
    } catch (err: any) {
      const filename = file.name || 'unnamed'
      const classification = classifyFile(filename)
      console.error(`[upload/folder] Error processing ${filename} (${classification}):`, err?.message || err)

      results.push({
        filename,
        type: classification,
        status: 'error',
        detail: err?.message || 'Processing failed',
      })

      try {
        await supabase!.from('upload_log').insert({
          trial_id: trialId,
          filename,
          file_type: classification,
          status: 'error',
          detail: err?.message || 'Processing failed',
        })
      } catch { /* logging is best-effort */ }
    }
  }

  return NextResponse.json({ results, trialId })
}
