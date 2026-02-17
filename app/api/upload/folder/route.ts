import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyFile, type FileClassification } from '@/lib/parsers/classify'
import { parseTrialSummary } from '@/lib/parsers/parseTrialSummary'
import { runPipeline } from '@/lib/upload-pipeline'

export const maxDuration = 60

const TYPE_LABELS: Record<FileClassification, string> = {
  trialSummary: 'Trial Summary',
  soilHealth: 'Soil Health',
  soilChemistry: 'Soil Chemistry',
  plotData: 'Plot Data',
  tissueChemistry: 'Tissue Chemistry',
  sampleMetadata: 'Assay Results',
  photo: 'Photo',
  gis: 'GIS',
  unknown: 'Unknown',
}

interface FileResult {
  filename: string
  type: string
  status: 'success' | 'error' | 'needs_review'
  detail?: string
  records?: number
  rawUploadId?: string
  unmappedColumns?: string[]
}

export async function POST(request: NextRequest) {
  let supabase: ReturnType<typeof createServerSupabaseClient>
  let formData: FormData
  let files: File[]

  try {
    supabase = createServerSupabaseClient()
    formData = await request.formData()
    files = formData.getAll('files') as File[]
  } catch (err: any) {
    console.error('Folder upload init error:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to read upload data', results: [] },
      { status: 400 }
    )
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided', results: [] }, { status: 400 })
  }

  const results: FileResult[] = []
  // Accept an optional trialId from the client (used when uploading photos separately)
  let trialId: string | null = (formData.get('trialId') as string) || null

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
      const typeLabel = TYPE_LABELS[classification]

      if (classification === 'trialSummary') {
        // Trial summary has its own dedicated parser (Excel workbook)
        const buffer = await file.arrayBuffer()
        const parsed = parseTrialSummary(buffer)

        if (!parsed.metadata.id) {
          results.push({
            filename,
            type: typeLabel,
            status: 'error',
            detail: 'Could not find a Trial ID in the workbook — check the "Trial" row exists and has a value',
          })
          continue
        }

        trialId = parsed.metadata.id

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

        if (parsed.treatments.length > 0) {
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
          type: typeLabel,
          status: 'success',
          detail: `Trial ${parsed.metadata.id} created/updated`,
          records: parsed.treatments.length,
        })

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

      } else if (classification === 'photo') {
        const targetTrialId = trialId
        if (!targetTrialId) {
          results.push({ filename, type: typeLabel, status: 'error', detail: 'No trial context — upload a Trial Summary first' })
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

        results.push({ filename, type: typeLabel, status: 'success', detail: 'Photo uploaded', records: 1 })

      } else if (classification === 'unknown') {
        results.push({ filename, type: typeLabel, status: 'success', detail: 'Skipped — not a recognised data file' })

      } else {
        // Data files (soilHealth, soilChemistry, plotData, tissueChemistry, sampleMetadata)
        // All handled by the generic upload pipeline
        const targetTrialId = trialId
        if (!targetTrialId) {
          results.push({ filename, type: typeLabel, status: 'error', detail: 'No trial context — upload a Trial Summary first' })
          continue
        }

        const isExcel = /\.xlsx?$/i.test(filename)
        const content = isExcel ? await file.arrayBuffer() : await file.text()

        const pipelineResult = await runPipeline(
          supabase,
          targetTrialId,
          classification,
          filename,
          content,
          isExcel,
        )

        results.push({
          filename,
          type: typeLabel,
          status: pipelineResult.status,
          detail: pipelineResult.detail,
          records: pipelineResult.records,
          rawUploadId: pipelineResult.rawUploadId,
          unmappedColumns: pipelineResult.unmappedColumns,
        })
      }
    } catch (err: any) {
      const filename = file.name || 'unnamed'
      let classification: FileClassification = 'unknown'
      try { classification = classifyFile(filename) } catch { /* defensive */ }

      console.error(`Folder upload error for ${filename}:`, err)

      results.push({
        filename,
        type: TYPE_LABELS[classification],
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
      } catch (logErr) { console.error('upload_log insert failed:', logErr) }
    }
  }

  return NextResponse.json({ results, trialId })
}
