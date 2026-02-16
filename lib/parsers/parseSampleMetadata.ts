import Papa from 'papaparse'

export interface SampleMetadataRow {
  assay_type: string
  sample_no: string
  date: string | null
  block: string
  treatment: number | null
  metric: string
  value: number | null
  unit: string
  raw_data: Record<string, any>
}

/**
 * Parse CSV with assay-specific sample metadata.
 * Expects wide-format with metadata columns (sample_no, date, block, treatment, assay_type)
 * and numeric metric columns. Each numeric column becomes a separate row (pivoted to long format).
 *
 * If assay_type is not present as a column, the assayType parameter is used as a fallback.
 */
export function parseSampleMetadata(csvText: string, assayType = 'general'): SampleMetadataRow[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  const rows: SampleMetadataRow[] = []

  const metadataCols = new Set([
    'sampleno', 'sample_no', 'sample no', 'sample',
    'date', 'block', 'property',
    'treatment', 'trt', 'trt_number',
    'assay_type', 'assay', 'assaytype',
    'barcode', 'rep', 'replicate',
  ])

  for (const row of result.data as Record<string, string>[]) {
    const normalized: Record<string, string> = {}
    for (const [key, val] of Object.entries(row)) {
      normalized[key.toLowerCase().trim()] = (val || '').trim()
    }

    const sampleNo = normalized['sampleno'] || normalized['sample_no'] || normalized['sample no'] || normalized['sample'] || ''
    const date = normalized['date'] || null
    const block = normalized['block'] || normalized['property'] || ''
    const trtRaw = normalized['treatment'] || normalized['trt'] || normalized['trt_number'] || ''
    const treatment = trtRaw ? parseInt(trtRaw, 10) : null
    const rowAssayType = normalized['assay_type'] || normalized['assay'] || normalized['assaytype'] || assayType

    for (const [key, val] of Object.entries(row)) {
      const lk = key.toLowerCase().trim()
      if (metadataCols.has(lk) || !val) continue
      const numVal = parseFloat(val)
      if (isNaN(numVal)) continue

      // Extract unit from column name if present, e.g. "pH (1:5)" or "Nitrogen (mg/kg)"
      const unitMatch = key.match(/\(([^)]+)\)/)
      const unit = unitMatch ? unitMatch[1] : ''
      const metric = key.replace(/\s*\([^)]+\)\s*/, '').trim()

      rows.push({
        assay_type: rowAssayType,
        sample_no: sampleNo,
        date,
        block,
        treatment: isNaN(treatment as number) ? null : treatment,
        metric,
        value: numVal,
        unit,
        raw_data: row,
      })
    }
  }

  return rows
}
