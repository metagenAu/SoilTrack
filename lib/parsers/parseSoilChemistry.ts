import Papa from 'papaparse'

export interface SoilChemistryRow {
  sample_no: string
  date: string | null
  block: string
  barcode: string
  metric: string
  value: number | null
  unit: string
  raw_data: Record<string, any>
}

export function parseSoilChemistry(csvText: string): SoilChemistryRow[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  const rows: SoilChemistryRow[] = []

  for (const row of result.data as Record<string, string>[]) {
    const normalized: Record<string, string> = {}
    for (const [key, val] of Object.entries(row)) {
      normalized[key.toLowerCase().trim()] = (val || '').trim()
    }

    const sampleNo = normalized['sampleno'] || normalized['sample_no'] || normalized['sample no'] || ''
    const date = normalized['date'] || null
    const block = normalized['block'] || ''
    const barcode = normalized['barcode'] || normalized['bar_code'] || normalized['bar code'] || ''

    // Each non-metadata column is a metric
    const metadataCols = new Set(['sampleno', 'sample_no', 'sample no', 'date', 'block', 'barcode', 'bar_code', 'bar code', 'property'])
    for (const [key, val] of Object.entries(row)) {
      const lk = key.toLowerCase().trim()
      if (metadataCols.has(lk) || !val) continue
      const numVal = parseFloat(val)
      if (isNaN(numVal)) continue

      // Extract unit from column name if present
      const unitMatch = key.match(/\(([^)]+)\)/)
      const unit = unitMatch ? unitMatch[1] : ''
      const metric = key.replace(/\s*\([^)]+\)\s*/, '').trim()

      rows.push({
        sample_no: sampleNo,
        date,
        block,
        barcode,
        metric,
        value: numVal,
        unit,
        raw_data: row,
      })
    }
  }

  return rows
}
