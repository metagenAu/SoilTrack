'use client'

import { useState, useMemo } from 'react'

interface MetadataEntry {
  id: string
  assay_type: string
  sample_no: string
  date: string | null
  block: string
  treatment: number | null
  metric: string
  value: number | null
  unit: string
}

export default function MetadataTable({ metadata }: { metadata: MetadataEntry[] }) {
  const [filterAssay, setFilterAssay] = useState<string>('')
  const [filterMetric, setFilterMetric] = useState<string>('')

  const assayTypes = useMemo(
    () => [...new Set(metadata.map(m => m.assay_type))].sort(),
    [metadata]
  )

  const metrics = useMemo(
    () => [...new Set(metadata.map(m => m.metric))].sort(),
    [metadata]
  )

  const filtered = useMemo(() => {
    let rows = metadata
    if (filterAssay) rows = rows.filter(r => r.assay_type === filterAssay)
    if (filterMetric) rows = rows.filter(r => r.metric === filterMetric)
    return rows
  }, [metadata, filterAssay, filterMetric])

  if (metadata.length === 0) {
    return (
      <div className="text-center py-8 text-brand-grey-1">
        <p className="text-sm">No assay results uploaded yet.</p>
        <p className="text-xs mt-1">Upload assay data (e.g. soil nitrate, fungal diversity) via the Data Hub or API.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <label className="signpost-label block mb-1">ASSAY TYPE</label>
          <select
            value={filterAssay}
            onChange={e => setFilterAssay(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-xs text-brand-black focus:outline-none focus:border-brand-black/30"
          >
            <option value="">All ({assayTypes.length})</option>
            {assayTypes.map(at => (
              <option key={at} value={at}>{at}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="signpost-label block mb-1">METRIC</label>
          <select
            value={filterMetric}
            onChange={e => setFilterMetric(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-xs text-brand-black focus:outline-none focus:border-brand-black/30"
          >
            <option value="">All ({metrics.length})</option>
            {metrics.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-brand-grey-1 mb-2">{filtered.length} records</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-grey-2">
              <th className="text-left py-2 px-3 text-brand-grey-1 font-medium text-xs">Assay Type</th>
              <th className="text-left py-2 px-3 text-brand-grey-1 font-medium text-xs">Sample</th>
              <th className="text-left py-2 px-3 text-brand-grey-1 font-medium text-xs">Date</th>
              <th className="text-left py-2 px-3 text-brand-grey-1 font-medium text-xs">Block</th>
              <th className="text-left py-2 px-3 text-brand-grey-1 font-medium text-xs">Trt</th>
              <th className="text-left py-2 px-3 text-brand-grey-1 font-medium text-xs">Metric</th>
              <th className="text-right py-2 px-3 text-brand-grey-1 font-medium text-xs">Value</th>
              <th className="text-left py-2 px-3 text-brand-grey-1 font-medium text-xs">Unit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map(row => (
              <tr key={row.id} className="border-b border-brand-grey-3 hover:bg-brand-grey-3/50">
                <td className="py-1.5 px-3 text-xs">{row.assay_type}</td>
                <td className="py-1.5 px-3 font-mono text-xs">{row.sample_no}</td>
                <td className="py-1.5 px-3 text-xs text-brand-grey-1">{row.date || '—'}</td>
                <td className="py-1.5 px-3 text-xs">{row.block || '—'}</td>
                <td className="py-1.5 px-3 font-mono text-xs">{row.treatment ?? '—'}</td>
                <td className="py-1.5 px-3 text-xs font-medium">{row.metric}</td>
                <td className="py-1.5 px-3 font-mono text-xs text-right">{row.value?.toFixed(2) ?? '—'}</td>
                <td className="py-1.5 px-3 text-xs text-brand-grey-1">{row.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <p className="text-xs text-brand-grey-1 text-center mt-2">
            Showing first 200 of {filtered.length} records
          </p>
        )}
      </div>
    </div>
  )
}
