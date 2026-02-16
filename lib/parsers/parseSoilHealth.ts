import Papa from 'papaparse'

export interface SoilHealthRow {
  sample_no: string
  date: string | null
  property: string
  block: string
  barcode: string
  latitude: number | null
  longitude: number | null
  raw_data: Record<string, any>
}

export function parseSoilHealth(csvText: string): SoilHealthRow[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  return (result.data as Record<string, string>[]).map((row) => {
    const normalized: Record<string, string> = {}
    for (const [key, val] of Object.entries(row)) {
      normalized[key.toLowerCase().trim()] = (val || '').trim()
    }

    return {
      sample_no: normalized['sampleno'] || normalized['sample_no'] || normalized['sample no'] || '',
      date: normalized['date'] || null,
      property: normalized['property'] || '',
      block: normalized['block'] || '',
      barcode: normalized['barcode'] || '',
      latitude: normalized['latitude'] ? parseFloat(normalized['latitude']) : null,
      longitude: normalized['longitude'] ? parseFloat(normalized['longitude']) : null,
      raw_data: row,
    }
  })
}
