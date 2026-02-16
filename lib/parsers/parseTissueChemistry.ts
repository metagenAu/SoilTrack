import * as XLSX from 'xlsx'

export interface TissueChemistryRow {
  sample_no: string
  date: string | null
  tissue_type: string
  metric: string
  value: number | null
  unit: string
  raw_data: Record<string, any>
}

export function parseTissueChemistry(buffer: ArrayBuffer): TissueChemistryRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const data: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet)

  const rows: TissueChemistryRow[] = []

  for (const row of data) {
    const normalized: Record<string, string> = {}
    for (const [key, val] of Object.entries(row)) {
      normalized[key.toLowerCase().trim()] = String(val || '').trim()
    }

    const sampleNo = normalized['sampleno'] || normalized['sample_no'] || normalized['sample no'] || ''
    const date = normalized['date'] || null
    const tissueType = normalized['tissue'] || normalized['tissue_type'] || normalized['tissue type'] || 'Unknown'

    const metadataCols = new Set(['sampleno', 'sample_no', 'sample no', 'date', 'tissue', 'tissue_type', 'tissue type'])
    for (const [key, val] of Object.entries(row)) {
      const lk = key.toLowerCase().trim()
      if (metadataCols.has(lk) || !val) continue
      const numVal = parseFloat(String(val))
      if (isNaN(numVal)) continue

      const unitMatch = key.match(/\(([^)]+)\)/)
      const unit = unitMatch ? unitMatch[1] : ''
      const metric = key.replace(/\s*\([^)]+\)\s*/, '').trim()

      rows.push({
        sample_no: sampleNo,
        date,
        tissue_type: tissueType,
        metric,
        value: numVal,
        unit,
        raw_data: row,
      })
    }
  }

  return rows
}
