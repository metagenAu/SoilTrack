import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyFile } from '@/lib/parsers/classify'
import { parseTrialSummary } from '@/lib/parsers/parseTrialSummary'
import { runPipeline } from '@/lib/upload-pipeline'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  let supabase: ReturnType<typeof createServerSupabaseClient>
  let formData: FormData

  try {
    supabase = createServerSupabaseClient()
    formData = await request.formData()
  } catch (err: any) {
    return NextResponse.json({ status: 'error', detail: err?.message || 'Failed to read upload data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const trialId = formData.get('trialId') as string
  const fileType = formData.get('fileType') as string

  if (!file || !trialId) {
    return NextResponse.json({ status: 'error', detail: 'Missing file or trial ID' }, { status: 400 })
  }

  const classification = fileType === 'auto' ? classifyFile(file.name || '') : fileType

  try {
    // Trial summary still uses its own parser (not a data table)
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

      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: file.name,
        file_type: 'trialSummary',
        status: 'success',
        records_imported: parsed.treatments.length,
      })

      return NextResponse.json({ status: 'success', detail: 'Trial updated', records: parsed.treatments.length })
    }

    // All data types go through the pipeline
    const isExcel = /\.xlsx?$/i.test(file.name || '')
    const content = isExcel ? await file.arrayBuffer() : await file.text()

    const extraDefaults: Record<string, any> = {}
    if (classification === 'sampleMetadata') {
      extraDefaults.assay_type = (formData.get('assayType') as string) || 'general'
    }

    const result = await runPipeline(
      supabase,
      trialId,
      classification,
      file.name || 'unnamed',
      content,
      isExcel,
      { extraDefaults },
    )

    try {
      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: file.name,
        file_type: classification,
        status: result.status === 'success' ? 'success' : 'error',
        detail: result.detail,
        records_imported: result.records,
      })
    } catch { /* logging is best-effort */ }

    return NextResponse.json(result)
  } catch (err: any) {
    try {
      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: file.name,
        file_type: classification,
        status: 'error',
        detail: err?.message,
      })
    } catch { /* logging is best-effort */ }
    return NextResponse.json({ status: 'error', detail: err?.message || 'Processing failed' })
  }
}
