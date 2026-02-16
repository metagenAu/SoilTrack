/**
 * Upload pipeline: orchestrates the full flow from raw file content
 * to staged raw_upload to transformed + loaded data.
 *
 * Flow:
 * 1. Parse file content (CSV via PapaParse, Excel via xlsx)
 * 2. Stage raw rows in raw_uploads table
 * 3. Apply column mapping via generic parser
 * 4. Load transformed rows via load_and_track RPC (atomic upsert + tracking)
 *
 * If column mapping has unmapped columns, the raw_upload stays in 'pending'
 * status and the UI can prompt the user to review.
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { COLUMN_MAPS, type ColumnMapConfig } from './parsers/column-maps'
import { genericParse, type ParseResult } from './parsers/generic-parser'
import { type SupabaseClient } from '@supabase/supabase-js'

export interface PipelineResult {
  status: 'success' | 'needs_review' | 'error'
  records?: number
  detail?: string
  rawUploadId?: string
  unmappedColumns?: string[]
  parseResult?: ParseResult
}

interface PipelineOptions {
  /** Override column mappings (from user review) */
  columnOverrides?: Record<string, string>
  /** Extra defaults to apply to every row (e.g. { assay_type: 'soilHealthChemistry' }) */
  extraDefaults?: Record<string, any>
  /** If true, skip staging to raw_uploads (for re-processing an existing raw_upload) */
  rawUploadId?: string
}

/**
 * Parse raw file content into an array of row objects.
 * Handles both CSV (string) and Excel (ArrayBuffer).
 */
export function parseRawContent(
  content: string | ArrayBuffer,
  isExcel: boolean
): { rows: Record<string, any>[]; headers: string[] } {
  if (isExcel) {
    const workbook = XLSX.read(content as ArrayBuffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const data: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { raw: true })
    const headers = data.length > 0 ? Object.keys(data[0]) : []
    // Normalize all values to strings for consistency
    const rows = data.map(row => {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(row)) {
        out[k] = String(v ?? '').trim()
      }
      return out
    })
    return { rows, headers }
  }

  // CSV
  const result = Papa.parse(content as string, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })
  const rows = result.data as Record<string, string>[]
  const headers = result.meta?.fields || (rows.length > 0 ? Object.keys(rows[0]) : [])
  return { rows, headers }
}

/**
 * Run the full pipeline for a data file.
 */
export async function runPipeline(
  supabase: SupabaseClient,
  trialId: string,
  fileType: string,
  filename: string,
  content: string | ArrayBuffer,
  isExcel: boolean,
  options?: PipelineOptions
): Promise<PipelineResult> {
  const config = COLUMN_MAPS[fileType]
  if (!config) {
    return { status: 'error', detail: `Unknown file type: ${fileType}` }
  }

  try {
    // Step 1: Parse raw content
    const { rows: rawRows, headers } = parseRawContent(content, isExcel)
    if (rawRows.length === 0) {
      return { status: 'error', detail: 'No data rows found in file' }
    }

    // Step 2: Apply column mapping
    const parseResult = genericParse(
      rawRows,
      config,
      options?.columnOverrides,
      options?.extraDefaults
    )

    if (parseResult.rows.length === 0) {
      return { status: 'error', detail: 'No valid records after transformation (check column mapping)' }
    }

    // Step 3: Stage raw content in raw_uploads
    let rawUploadId = options?.rawUploadId
    if (!rawUploadId) {
      const { data: staged, error: stageError } = await supabase
        .from('raw_uploads')
        .insert({
          trial_id: trialId,
          filename,
          file_type: fileType,
          raw_rows: rawRows,
          headers,
          column_map: parseResult.appliedMap,
          unmapped_columns: parseResult.unmappedColumns,
          status: parseResult.unmappedColumns.length > 0 && config.pivotMode === 'none'
            ? 'pending'
            : 'mapped',
        })
        .select('id')
        .single()

      if (stageError) {
        return { status: 'error', detail: `Failed to stage upload: ${stageError.message}` }
      }
      rawUploadId = staged.id
    }

    // For direct-mode parsers with unmapped columns, pause for user review
    // (Pivot-mode parsers treat unknown columns as metrics, so no review needed)
    if (
      parseResult.unmappedColumns.length > 0 &&
      config.pivotMode === 'none' &&
      !options?.columnOverrides
    ) {
      return {
        status: 'needs_review',
        rawUploadId,
        unmappedColumns: parseResult.unmappedColumns,
        parseResult,
        detail: `${parseResult.unmappedColumns.length} column(s) could not be auto-matched`,
      }
    }

    // Step 4: Load via atomic RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc('load_and_track', {
      p_table_name: config.tableName,
      p_trial_id: trialId,
      p_file_type: config.fileType,
      p_filename: filename,
      p_rows: parseResult.rows,
      p_raw_upload_id: rawUploadId,
    })

    if (rpcError) {
      // Update raw_upload status
      await supabase
        .from('raw_uploads')
        .update({ status: 'error', error_detail: rpcError.message })
        .eq('id', rawUploadId)

      return { status: 'error', detail: rpcError.message, rawUploadId }
    }

    const result = rpcResult as { status: string; records?: number; detail?: string }
    if (result.status === 'error') {
      return { status: 'error', detail: result.detail, rawUploadId }
    }

    return {
      status: 'success',
      records: result.records,
      rawUploadId,
      detail: `Upserted ${result.records} records`,
    }
  } catch (err: any) {
    return { status: 'error', detail: err.message || 'Pipeline failed' }
  }
}

/**
 * Re-process an existing raw_upload with user-provided column overrides.
 * Called after the user reviews unmapped columns in the UI.
 */
export async function reprocessRawUpload(
  supabase: SupabaseClient,
  rawUploadId: string,
  columnOverrides: Record<string, string>
): Promise<PipelineResult> {
  // Fetch the raw upload
  const { data: rawUpload, error: fetchError } = await supabase
    .from('raw_uploads')
    .select('*')
    .eq('id', rawUploadId)
    .single()

  if (fetchError || !rawUpload) {
    return { status: 'error', detail: `Raw upload not found: ${fetchError?.message}` }
  }

  const config = COLUMN_MAPS[rawUpload.file_type]
  if (!config) {
    return { status: 'error', detail: `Unknown file type: ${rawUpload.file_type}` }
  }

  // Update the raw_upload with the new mapping
  await supabase
    .from('raw_uploads')
    .update({
      column_map: { ...(rawUpload.column_map || {}), ...columnOverrides },
      unmapped_columns: [],
      status: 'mapped',
    })
    .eq('id', rawUploadId)

  // Re-run generic parse with overrides
  const parseResult = genericParse(
    rawUpload.raw_rows,
    config,
    columnOverrides
  )

  if (parseResult.rows.length === 0) {
    return { status: 'error', detail: 'No valid records after re-mapping' }
  }

  // Load via RPC
  const { data: rpcResult, error: rpcError } = await supabase.rpc('load_and_track', {
    p_table_name: config.tableName,
    p_trial_id: rawUpload.trial_id,
    p_file_type: config.fileType,
    p_filename: rawUpload.filename,
    p_rows: parseResult.rows,
    p_raw_upload_id: rawUploadId,
  })

  if (rpcError) {
    await supabase
      .from('raw_uploads')
      .update({ status: 'error', error_detail: rpcError.message })
      .eq('id', rawUploadId)
    return { status: 'error', detail: rpcError.message, rawUploadId }
  }

  const result = rpcResult as { status: string; records?: number; detail?: string }
  if (result.status === 'error') {
    return { status: 'error', detail: result.detail, rawUploadId }
  }

  return {
    status: 'success',
    records: result.records,
    rawUploadId,
    detail: `Upserted ${result.records} records`,
  }
}
