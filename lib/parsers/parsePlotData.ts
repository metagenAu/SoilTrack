import Papa from 'papaparse'

export interface PlotDataRow {
  plot: string
  trt_number: number | null
  rep: number | null
  yield_t_ha: number | null
  plant_count: number | null
  vigour: number | null
  disease_score: number | null
  raw_data: Record<string, any>
}

export function parsePlotData(csvText: string): PlotDataRow[] {
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

    function num(key: string): number | null {
      const v = normalized[key]
      if (!v) return null
      const n = parseFloat(v)
      return isNaN(n) ? null : n
    }

    return {
      plot: normalized['plot'] || normalized['plot no'] || '',
      trt_number: num('trt') ?? num('treatment') ?? num('trt_number'),
      rep: num('rep') ?? num('replicate'),
      yield_t_ha: num('yield') ?? num('yield_t_ha') ?? num('yield t/ha'),
      plant_count: num('plant_count') ?? num('plant count') ?? num('plants'),
      vigour: num('vigour') ?? num('vigor'),
      disease_score: num('disease') ?? num('disease_score') ?? num('disease score'),
      raw_data: row,
    }
  })
}
