import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

interface MetricStats {
  metric: string
  unit: string
  groups: GroupStats[]
}

interface GroupStats {
  label: string       // trial ID, treatment label, or block
  mean: number
  stdError: number
  stdDev: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  n: number
  values: number[]
}

function computeStats(values: number[]): Omit<GroupStats, 'label' | 'values'> {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length

  if (n === 0) {
    return { mean: 0, stdError: 0, stdDev: 0, min: 0, q1: 0, median: 0, q3: 0, max: 0, n: 0 }
  }

  const mean = sorted.reduce((s, v) => s + v, 0) / n
  const variance = n > 1 ? sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0
  const stdDev = Math.sqrt(variance)
  const stdError = n > 0 ? stdDev / Math.sqrt(n) : 0

  const q = (p: number) => {
    const pos = (n - 1) * p
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    const frac = pos - lo
    return sorted[lo] * (1 - frac) + sorted[hi] * frac
  }

  return {
    mean,
    stdError,
    stdDev,
    min: sorted[0],
    q1: q(0.25),
    median: q(0.5),
    q3: q(0.75),
    max: sorted[n - 1],
    n,
  }
}

/**
 * GET /api/analysis
 * Query params:
 *   - source: 'sampleMetadata' | 'soilChemistry' | 'tissueChemistry' | 'plotData'
 *   - trialId: single trial ID (optional; if omitted, aggregates across all trials)
 *   - trialIds: comma-separated trial IDs for cross-trial comparison
 *   - groupBy: 'trial' | 'treatment' | 'block' (default: 'treatment')
 *   - assayType: filter by assay_type (for sampleMetadata source)
 *   - metrics: comma-separated metric names to filter (optional)
 *
 * Returns { metrics: MetricStats[] }
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const params = request.nextUrl.searchParams

  const source = params.get('source') || 'sampleMetadata'
  const trialId = params.get('trialId')
  const trialIdsParam = params.get('trialIds')
  const groupBy = params.get('groupBy') || 'treatment'
  const assayType = params.get('assayType')
  const metricsFilter = params.get('metrics')

  const trialIds = trialIdsParam
    ? trialIdsParam.split(',').map(s => s.trim()).filter(Boolean)
    : trialId
      ? [trialId]
      : []

  // Fetch raw data from the appropriate source table
  let rawData: any[] = []

  if (source === 'sampleMetadata') {
    let query = supabase.from('sample_metadata').select('*')
    if (trialIds.length > 0) query = query.in('trial_id', trialIds)
    if (assayType) query = query.eq('assay_type', assayType)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rawData = data || []
  } else if (source === 'soilChemistry') {
    let query = supabase.from('soil_chemistry').select('*')
    if (trialIds.length > 0) query = query.in('trial_id', trialIds)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rawData = data || []
  } else if (source === 'tissueChemistry') {
    let query = supabase.from('tissue_chemistry').select('*')
    if (trialIds.length > 0) query = query.in('trial_id', trialIds)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rawData = data || []
  } else if (source === 'plotData') {
    let query = supabase.from('plot_data').select('*')
    if (trialIds.length > 0) query = query.in('trial_id', trialIds)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Pivot plot data into long format with synthetic metrics
    rawData = []
    for (const row of data || []) {
      if (row.yield_t_ha != null) {
        rawData.push({ ...row, metric: 'Yield', value: row.yield_t_ha, unit: 't/ha', treatment: row.trt_number })
      }
      if (row.plant_count != null) {
        rawData.push({ ...row, metric: 'Plant Count', value: row.plant_count, unit: 'count', treatment: row.trt_number })
      }
      if (row.vigour != null) {
        rawData.push({ ...row, metric: 'Vigour', value: row.vigour, unit: 'score', treatment: row.trt_number })
      }
      if (row.disease_score != null) {
        rawData.push({ ...row, metric: 'Disease Score', value: row.disease_score, unit: 'score', treatment: row.trt_number })
      }
    }
  } else {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }

  // Filter by specific metrics if requested
  const metricsList = metricsFilter ? metricsFilter.split(',').map(s => s.trim()) : null
  if (metricsList) {
    rawData = rawData.filter(r => metricsList.includes(r.metric))
  }

  // Fetch treatments for label enrichment when grouping by treatment
  let treatmentLabels: Record<string, Record<number, string>> = {}
  if (groupBy === 'treatment') {
    const tQuery = trialIds.length > 0
      ? supabase.from('treatments').select('trial_id, trt_number, product, application').in('trial_id', trialIds)
      : supabase.from('treatments').select('trial_id, trt_number, product, application')
    const { data: treatments } = await tQuery
    for (const t of treatments || []) {
      if (!treatmentLabels[t.trial_id]) treatmentLabels[t.trial_id] = {}
      treatmentLabels[t.trial_id][t.trt_number] = t.product || t.application || `Trt ${t.trt_number}`
    }
  }

  // Group data by metric, then by groupBy dimension
  const metricMap = new Map<string, { unit: string; groups: Map<string, number[]> }>()

  for (const row of rawData) {
    if (row.value == null || row.metric == null) continue
    const val = typeof row.value === 'string' ? parseFloat(row.value) : row.value
    if (isNaN(val)) continue

    const key = row.metric
    if (!metricMap.has(key)) {
      metricMap.set(key, { unit: row.unit || '', groups: new Map() })
    }

    let groupLabel: string
    if (groupBy === 'trial') {
      groupLabel = row.trial_id || 'Unknown'
    } else if (groupBy === 'treatment') {
      const trtNum = row.treatment || row.trt_number
      if (trtNum != null) {
        const labels = treatmentLabels[row.trial_id] || {}
        groupLabel = labels[trtNum] || `Trt ${trtNum}`
      } else {
        groupLabel = 'Unassigned'
      }
    } else if (groupBy === 'block') {
      groupLabel = row.block || 'Unknown'
    } else {
      groupLabel = 'All'
    }

    const entry = metricMap.get(key)!
    if (!entry.groups.has(groupLabel)) {
      entry.groups.set(groupLabel, [])
    }
    entry.groups.get(groupLabel)!.push(val)
  }

  // Compute stats for each metric's groups
  const metrics: MetricStats[] = []
  for (const [metric, entry] of metricMap) {
    const groups: GroupStats[] = []
    for (const [label, values] of entry.groups) {
      const stats = computeStats(values)
      groups.push({ label, values, ...stats })
    }
    groups.sort((a, b) => a.label.localeCompare(b.label))
    metrics.push({ metric, unit: entry.unit, groups })
  }

  metrics.sort((a, b) => a.metric.localeCompare(b.metric))

  return NextResponse.json({ metrics })
}
