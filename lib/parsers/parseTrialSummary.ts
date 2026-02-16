import * as XLSX from 'xlsx'

interface TrialMetadata {
  id: string
  name: string
  grower: string
  location: string
  gps: string
  crop: string
  trial_type: string
  contact: string
  planting_date: string | null
  harvest_date: string | null
  num_treatments: number
  reps: number
}

interface TreatmentRow {
  trt_number: number
  application: string
  fertiliser: string
  product: string
  rate: string
  timing: string
}

export interface TrialSummaryResult {
  metadata: TrialMetadata
  treatments: TreatmentRow[]
}

export function parseTrialSummary(buffer: ArrayBuffer): TrialSummaryResult {
  const workbook = XLSX.read(buffer, { type: 'array' })

  // Find the Treatments sheet (or first sheet)
  const sheetName = workbook.SheetNames.find(
    (n) => n.toLowerCase().includes('treatment')
  ) || workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true })

  // Parse metadata from key-value rows
  const metadata: Record<string, string> = {}
  let treatmentStartRow = -1

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    const label = String(row[0] || '').trim().toLowerCase().replace(/:+$/, '')
    const value = row[1] !== undefined ? String(row[1]).trim() : ''

    if (label === 'trial' || label === 'trial id' || label === 'trial no' || label === 'trial no.' || label === 'trial number' || label === 'trial code') metadata.id = value
    else if (label === 'grower') metadata.grower = value
    else if (label === 'name') metadata.name = value
    else if (label === 'location') metadata.location = value
    else if (label === 'gps') metadata.gps = value
    else if (label === 'crop') metadata.crop = value
    else if (label === 'trial type') metadata.trial_type = value
    else if (label === 'contact') metadata.contact = value
    else if (label === 'planting' || label === 'planting date') metadata.planting_date = value
    else if (label === 'harvest' || label === 'harvest date') metadata.harvest_date = value
    else if (label === 'treatments') metadata.num_treatments = value
    else if (label === 'reps') metadata.reps = value

    // Detect treatment table header
    if (label === 'treatment' && row.length >= 3) {
      treatmentStartRow = i + 1
    }
  }

  // Parse treatments
  const treatments: TreatmentRow[] = []
  if (treatmentStartRow > 0) {
    for (let i = treatmentStartRow; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0 || !row[0]) break

      const trtNum = parseInt(String(row[0]))
      if (isNaN(trtNum)) break

      treatments.push({
        trt_number: trtNum,
        application: String(row[1] || '').trim(),
        fertiliser: String(row[2] || '').trim(),
        product: String(row[3] || '').trim(),
        rate: String(row[4] || '').trim(),
        timing: String(row[5] || '').trim(),
      })
    }
  }

  function parseDate(val: string): string | null {
    if (!val) return null

    // With raw:true, date cells come through as Excel serial numbers.
    // Excel serial date = days since 1899-12-30 (includes the Lotus 1-2-3 bug).
    const num = Number(val)
    if (!isNaN(num) && num > 1 && num < 200000) {
      const ms = Date.UTC(1899, 11, 30) + num * 86400000
      return new Date(ms).toISOString().split('T')[0]
    }

    // Try YYYY-MM-DD (ISO) first — unambiguous
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      const d = new Date(val)
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    }
    // Try DD/MM/YYYY (AU locale convention)
    const m = val.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
    if (m) {
      const day = parseInt(m[1], 10)
      const month = parseInt(m[2], 10)
      const year = parseInt(m[3], 10)
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const d = new Date(year, month - 1, day)
        if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
          return d.toISOString().split('T')[0]
        }
      }
    }
    // Fallback: JS Date constructor
    try {
      const d = new Date(val)
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
    } catch {
      return null
    }
  }

  return {
    metadata: {
      id: metadata.id || '',
      name: metadata.name || '',
      grower: metadata.grower || metadata.name || '',
      location: metadata.location || '',
      gps: metadata.gps || '',
      crop: metadata.crop || '',
      trial_type: metadata.trial_type || '',
      contact: metadata.contact || '',
      planting_date: parseDate(metadata.planting_date || ''),
      harvest_date: parseDate(metadata.harvest_date || ''),
      num_treatments: parseInt(metadata.num_treatments || '0') || treatments.length,
      reps: parseInt(metadata.reps || '0') || 1,
    },
    treatments,
  }
}
