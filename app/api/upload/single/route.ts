import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyFile } from '@/lib/parsers/classify'
import { parseTrialSummary } from '@/lib/parsers/parseTrialSummary'
import { runPipeline, parseRawContent } from '@/lib/upload-pipeline'
import { COLUMN_MAPS, extractTrialId } from '@/lib/parsers/column-maps'
import { getUserRole, canUpload } from '@/lib/auth'
import { autoLinkTrialToField } from '@/lib/fields'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const { role } = await getUserRole()
  if (!canUpload(role)) {
    return NextResponse.json({ status: 'error', detail: 'Upload permission required' }, { status: 403 })
  }
  let supabase: ReturnType<typeof createServerSupabaseClient>
  let formData: FormData

  try {
    supabase = createServerSupabaseClient()
    formData = await request.formData()
  } catch (err: any) {
    console.error('Single upload init error:', err)
    return NextResponse.json({ status: 'error', detail: err?.message || 'Failed to read upload data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  let trialId = formData.get('trialId') as string
  const fileType = formData.get('fileType') as string

  if (!file) {
    return NextResponse.json({ status: 'error', detail: 'Missing file' }, { status: 400 })
  }

  const filename = file.name || 'unnamed'
  const classification = fileType === 'auto' ? classifyFile(filename) : fileType

  // Read file content once upfront so it can be reused for both auto-detection and processing
  const isExcel = /\.xlsx?$/i.test(filename)
  const fileContent = isExcel ? await file.arrayBuffer() : await file.text()

  // Auto-detect trial ID from file content when not provided
  if (!trialId && classification !== 'trialSummary') {
    const config = COLUMN_MAPS[classification]
    if (config) {
      const { rows } = parseRawContent(fileContent, isExcel)
      const detected = extractTrialId(rows, config)
      if (detected) {
        trialId = detected
        // Ensure the trial exists (create a minimal record if auto-detected)
        await supabase.from('trials').upsert(
          { id: detected, name: detected },
          { onConflict: 'id', ignoreDuplicates: true }
        )
        // Auto-link trial to a field (creates one if needed)
        autoLinkTrialToField(supabase, detected).catch(() => {})
      }
    }
  }

  if (!trialId) {
    return NextResponse.json({ status: 'error', detail: 'Missing trial ID — select a trial or ensure the file contains a grower/property/trial column' }, { status: 400 })
  }

  try {
    // Trial summary still uses its own parser (not a data table)
    if (classification === 'trialSummary') {
      const buffer = isExcel ? fileContent as ArrayBuffer : await file.arrayBuffer()
      const parsed = parseTrialSummary(buffer)

      // Bug #4: Warn if the summary's internal ID doesn't match the selected trial
      if (parsed.metadata.id && parsed.metadata.id !== trialId) {
        console.warn(`Trial summary ID "${parsed.metadata.id}" does not match selected trial "${trialId}" — updating selected trial`)
      }

      // Bug #2: Use upsert so this works for both new and existing trials
      // Bug #3: Check for errors from Supabase
      const { error: trialError } = await supabase.from('trials').upsert({
        id: trialId,
        name: parsed.metadata.name || `Trial ${trialId}`,
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
      })

      if (trialError) throw trialError

      // Auto-link trial to a field (creates one if needed)
      autoLinkTrialToField(supabase, trialId).catch(() => {})

      if (parsed.treatments.length > 0) {
        // Bug #1: Use upsert-then-cleanup instead of delete-then-insert
        // so a failed insert doesn't leave us with zero treatments
        const newTreatments = parsed.treatments.map((t, i) => ({
          trial_id: trialId,
          trt_number: t.trt_number,
          application: t.application,
          fertiliser: t.fertiliser,
          product: t.product,
          rate: t.rate,
          timing: t.timing,
          sort_order: i + 1,
        }))

        const { error: insertError } = await supabase.from('treatments').upsert(
          newTreatments,
          { onConflict: 'trial_id,trt_number' }
        )
        if (insertError) throw insertError

        // Remove stale treatments no longer in the new set
        const newTrtNumbers = parsed.treatments.map(t => t.trt_number)
        const { error: cleanupError } = await supabase
          .from('treatments')
          .delete()
          .eq('trial_id', trialId)
          .not('trt_number', 'in', `(${newTrtNumbers.join(',')})`)
        if (cleanupError) {
          console.error('Treatment cleanup failed:', cleanupError)
        }
      }

      try {
        await supabase.from('upload_log').insert({
          trial_id: trialId,
          filename: file.name,
          file_type: 'trialSummary',
          status: 'success',
          records_imported: parsed.treatments.length,
        })
      } catch (logErr) { console.error('upload_log insert failed:', logErr) }

      return NextResponse.json({ status: 'success', detail: 'Trial updated', records: parsed.treatments.length })
    }

    // All data types go through the pipeline
    const extraDefaults: Record<string, any> = {}
    if (classification === 'sampleMetadata') {
      extraDefaults.assay_type = (formData.get('assayType') as string) || 'general'
    }

    const result = await runPipeline(
      supabase,
      trialId,
      classification,
      file.name || 'unnamed',
      fileContent,
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

    return NextResponse.json({ ...result, fileType: classification })
  } catch (err: any) {
    console.error(`Single upload error for ${file.name}:`, err)
    try {
      await supabase.from('upload_log').insert({
        trial_id: trialId,
        filename: file.name,
        file_type: classification,
        status: 'error',
        detail: err?.message,
      })
    } catch (logErr) { console.error('upload_log insert failed:', logErr) }
    return NextResponse.json({ status: 'error', detail: err?.message || 'Processing failed' })
  }
}
