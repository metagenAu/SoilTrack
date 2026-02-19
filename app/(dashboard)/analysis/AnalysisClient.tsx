'use client'

import { useState } from 'react'
import { Loader2, BarChart3, BoxSelect } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'

const BoxPlotChart = dynamic(() => import('@/components/analysis/BoxPlotChart'), {
  loading: () => <div className="h-64 flex items-center justify-center text-sm text-brand-grey-1">Loading chart…</div>,
})
const BarChartWithSE = dynamic(() => import('@/components/analysis/BarChartWithSE'), {
  loading: () => <div className="h-64 flex items-center justify-center text-sm text-brand-grey-1">Loading chart…</div>,
})

const DATA_SOURCES = [
  { value: 'sampleMetadata', label: 'Assay Results' },
  { value: 'soilChemistry', label: 'Soil Chemistry' },
  { value: 'tissueChemistry', label: 'Tissue Chemistry' },
  { value: 'plotData', label: 'Plot Data' },
]

const GROUP_BY_OPTIONS = [
  { value: 'treatment', label: 'Treatment' },
  { value: 'trial', label: 'Trial' },
  { value: 'block', label: 'Block' },
]

interface GroupStats {
  label: string
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

interface MetricStats {
  metric: string
  unit: string
  groups: GroupStats[]
}

interface AnalysisClientProps {
  trials: { id: string; name: string }[]
  assayTypes: string[]
}

export default function AnalysisClient({ trials, assayTypes }: AnalysisClientProps) {
  const [source, setSource] = useState('sampleMetadata')
  const [selectedTrials, setSelectedTrials] = useState<string[]>([])
  const [groupBy, setGroupBy] = useState('treatment')
  const [assayType, setAssayType] = useState('')
  const [chartType, setChartType] = useState<'bar' | 'box'>('bar')
  const [loading, setLoading] = useState(false)
  const [metrics, setMetrics] = useState<MetricStats[]>([])
  const [hasRun, setHasRun] = useState(false)

  function toggleTrial(id: string) {
    setSelectedTrials(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  async function runAnalysis() {
    setLoading(true)
    setMetrics([])
    setHasRun(true)

    const params = new URLSearchParams()
    params.set('source', source)
    params.set('groupBy', groupBy)
    if (selectedTrials.length > 0) {
      params.set('trialIds', selectedTrials.join(','))
    }
    if (assayType && source === 'sampleMetadata') {
      params.set('assayType', assayType)
    }

    try {
      const res = await fetch(`/api/analysis?${params}`)
      const data = await res.json()
      setMetrics(data.metrics || [])
    } catch {
      // Silently handle
    }
    setLoading(false)
  }

  return (
    <div>
      {/* Controls */}
      <div className="card mb-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Data Source */}
          <div>
            <label className="signpost-label block mb-1">DATA SOURCE</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
            >
              {DATA_SOURCES.map(ds => (
                <option key={ds.value} value={ds.value}>{ds.label}</option>
              ))}
            </select>
          </div>

          {/* Group By */}
          <div>
            <label className="signpost-label block mb-1">GROUP BY</label>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
            >
              {GROUP_BY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Assay Type (only for sampleMetadata) */}
          {source === 'sampleMetadata' && assayTypes.length > 0 && (
            <div>
              <label className="signpost-label block mb-1">ASSAY TYPE</label>
              <select
                value={assayType}
                onChange={e => setAssayType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
              >
                <option value="">All assay types</option>
                {assayTypes.map(at => (
                  <option key={at} value={at}>{at}</option>
                ))}
              </select>
            </div>
          )}

          {/* Chart Type */}
          <div>
            <label className="signpost-label block mb-1">CHART TYPE</label>
            <div className="flex gap-2">
              <button
                onClick={() => setChartType('bar')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  chartType === 'bar'
                    ? 'bg-brand-black text-white'
                    : 'bg-brand-grey-3 border border-brand-grey-2 text-brand-black/70 hover:bg-brand-grey-2'
                )}
              >
                <BarChart3 size={14} />
                Bar (Mean + SE)
              </button>
              <button
                onClick={() => setChartType('box')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  chartType === 'box'
                    ? 'bg-brand-black text-white'
                    : 'bg-brand-grey-3 border border-brand-grey-2 text-brand-black/70 hover:bg-brand-grey-2'
                )}
              >
                <BoxSelect size={14} />
                Box Plot
              </button>
            </div>
          </div>
        </div>

        {/* Trial Selection */}
        <div className="mb-4">
          <label className="signpost-label block mb-2">SELECT TRIALS</label>
          <div className="flex flex-wrap gap-2">
            {trials.map(t => (
              <button
                key={t.id}
                onClick={() => toggleTrial(t.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  selectedTrials.includes(t.id)
                    ? 'bg-brand-black text-white'
                    : 'bg-brand-grey-3 text-brand-black/70 hover:bg-brand-grey-2'
                )}
              >
                {t.id}
              </button>
            ))}
            {trials.length === 0 && (
              <p className="text-sm text-brand-grey-1">No trials found</p>
            )}
          </div>
          {selectedTrials.length === 0 && trials.length > 0 && (
            <p className="text-xs text-brand-grey-1 mt-1">No trials selected — will analyse across all trials</p>
          )}
        </div>

        <Button onClick={runAnalysis} disabled={loading}>
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Analysing...
            </>
          ) : (
            <>
              <BarChart3 size={14} />
              Run Analysis
            </>
          )}
        </Button>
      </div>

      {/* Results */}
      {hasRun && !loading && metrics.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-brand-grey-1 text-sm">No data found for the selected criteria.</p>
          <p className="text-brand-grey-1 text-xs mt-1">Try selecting different trials or data source.</p>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="space-y-6">
          {metrics.map(m => (
            <div key={m.metric} className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-brand-black">{m.metric}</h3>
                  {m.unit && (
                    <span className="text-xs text-brand-grey-1">({m.unit})</span>
                  )}
                </div>
                <div className="text-xs text-brand-grey-1">
                  {m.groups.reduce((s, g) => s + g.n, 0)} observations across {m.groups.length} groups
                </div>
              </div>

              {chartType === 'bar' ? (
                <BarChartWithSE metric={m} />
              ) : (
                <BoxPlotChart metric={m} />
              )}

              {/* Summary table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-brand-grey-2">
                      <th className="text-left py-1.5 px-2 text-brand-grey-1 font-medium">Group</th>
                      <th className="text-right py-1.5 px-2 text-brand-grey-1 font-medium">n</th>
                      <th className="text-right py-1.5 px-2 text-brand-grey-1 font-medium">Mean</th>
                      <th className="text-right py-1.5 px-2 text-brand-grey-1 font-medium">SE</th>
                      <th className="text-right py-1.5 px-2 text-brand-grey-1 font-medium">SD</th>
                      <th className="text-right py-1.5 px-2 text-brand-grey-1 font-medium">Min</th>
                      <th className="text-right py-1.5 px-2 text-brand-grey-1 font-medium">Median</th>
                      <th className="text-right py-1.5 px-2 text-brand-grey-1 font-medium">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.groups.map(g => (
                      <tr key={g.label} className="border-b border-brand-grey-3">
                        <td className="py-1.5 px-2 font-medium">{g.label}</td>
                        <td className="text-right py-1.5 px-2 font-mono">{g.n}</td>
                        <td className="text-right py-1.5 px-2 font-mono">{g.mean.toFixed(2)}</td>
                        <td className="text-right py-1.5 px-2 font-mono">{g.stdError.toFixed(3)}</td>
                        <td className="text-right py-1.5 px-2 font-mono">{g.stdDev.toFixed(3)}</td>
                        <td className="text-right py-1.5 px-2 font-mono">{g.min.toFixed(2)}</td>
                        <td className="text-right py-1.5 px-2 font-mono">{g.median.toFixed(2)}</td>
                        <td className="text-right py-1.5 px-2 font-mono">{g.max.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
