import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyFile } from '@/lib/parsers/classify'
import { parseTrialSummary } from '@/lib/parsers/parseTrialSummary'
import { runPipeline } from '@/lib/upload-pipeline'

export const maxDuration = 60

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

        await supabase.from('upload_log').insert({
          trial_id: parsed.metadata.id,
          filename: file.name,
          file_type: 'trialSummary',
          status: 'success',
          detail: `Trial created with ${parsed.treatments.length} treatments`,
          records_imported: parsed.treatments.length,
        })

      } else if (classification === 'photo') {
        results.push({ filename: file.name, type: 'Photo', status: 'success', detail: 'Skipped (photo storage not yet configured)' })

      } else if (classification === 'unknown') {
        results.push({ filename: file.name, type: 'Unknown', status: 'success', detail: 'Skipped — not a recognised data file' })

      } else {
        // Data files: soilHealth, soilChemistry, plotData, tissueChemistry, sampleMetadata
        const targetTrialId = trialId
        if (!targetTrialId) {
          results.push({ filename: file.name, type: classification, status: 'error', detail: 'No trial context' })
          continue
        }

        const isExcel = classification === 'tissueChemistry'
        const content = isExcel ? await file.arrayBuffer() : await file.text()

        const pipelineResult = await runPipeline(
          supabase,
          targetTrialId,
          classification,
          file.name,
          content,
          isExcel,
        )

        results.push({
          filename: file.name,
          type: classification,
          status: pipelineResult.status === 'success' ? 'success' : pipelineResult.status === 'needs_review' ? 'needs_review' : 'error',
          detail: pipelineResult.detail,
          records: pipelineResult.records,
          rawUploadId: pipelineResult.rawUploadId,
          unmappedColumns: pipelineResult.unmappedColumns,
        })
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
