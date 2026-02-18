'use client'

import { useMemo, useState } from 'react'
import ProductTag from '@/components/ui/ProductTag'

const PAGE_SIZE = 50

interface PlotDataRow {
  id: string
  plot: string | null
  trt_number: number | null
  rep: number | null
  yield_t_ha: number | null
  plant_count: number | null
  vigour: number | null
  disease_score: number | null
  raw_data?: Record<string, any> | null
  treatment_product?: string | null
  treatment_application?: string | null
}

interface PlotDataTableProps {
  plots: PlotDataRow[]
}

/**
 * Columns to hide from the table because they're redundant with page context
 * or are internal identifiers that aren't useful to display.
 */
const HIDDEN_COLUMNS = new Set([
  'trial', 'trial id', 'trial_id', 'trial no', 'trial no.', 'trial number', 'trial code',
])

/**
 * Priority ordering for columns — lower index = further left.
 * Columns not in this list appear after all priority columns, in their original CSV order.
 */
const COLUMN_PRIORITY: string[] = [
  'plot', 'plot no', 'plot_no', 'plot number',
  'row',
  'column', 'col',
  'uid',
  'trt', 'treatment', 'trt_number',
  'application',
  'fertiliser', 'fertilizer',
  'product',
  'rep', 'replicate',
]

/** Fallback typed columns for rows that don't have raw_data */
const FALLBACK_COLUMNS = [
  { key: 'plot', label: 'Plot' },
  { key: 'trt_number', label: 'Treatment' },
  { key: 'rep', label: 'Rep' },
  { key: 'yield_t_ha', label: 'Yield t/ha' },
  { key: 'plant_count', label: 'Plant Count' },
  { key: 'vigour', label: 'Vigour' },
  { key: 'disease_score', label: 'Disease Score' },
]

function getPriorityIndex(colLower: string): number {
  const idx = COLUMN_PRIORITY.indexOf(colLower)
  return idx === -1 ? COLUMN_PRIORITY.length : idx
}

/**
 * Discover all unique column names from raw_data across all rows,
 * ordered by priority then by first-seen position.
 */
function discoverColumns(plots: PlotDataRow[]): string[] {
  const seen = new Map<string, string>() // lowercased → original header name
  const order: string[] = [] // lowercased keys in first-seen order

  for (const p of plots) {
    if (!p.raw_data) continue
    for (const key of Object.keys(p.raw_data)) {
      const lower = key.toLowerCase().trim()
      if (HIDDEN_COLUMNS.has(lower)) continue
      if (!seen.has(lower)) {
        seen.set(lower, key)
        order.push(lower)
      }
    }
  }

  // Sort: priority columns first, then remaining in original CSV order
  order.sort((a, b) => {
    const pa = getPriorityIndex(a)
    const pb = getPriorityIndex(b)
    if (pa !== pb) return pa - pb
    return 0 // preserve relative order for non-priority columns
  })

  return order.map(lower => seen.get(lower)!)
}

function formatCellValue(val: any): string {
  if (val === undefined || val === null || val === '') return '—'
  // Format numbers: if it parses as a float with decimals, show 2dp
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : val.toFixed(2)
  }
  const s = String(val).trim()
  if (!s) return '—'
  const n = parseFloat(s)
  if (!isNaN(n) && /^\d+\.\d+$/.test(s)) {
    return n.toFixed(2)
  }
  return s
}

/** Pagination controls shared by both table modes */
function PaginationBar({ page, totalPages, total, onPrev, onNext }: {
  page: number; totalPages: number; total: number
  onPrev: () => void; onNext: () => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-3 text-xs text-brand-grey-1">
      <span>
        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
      </span>
      <div className="flex gap-1">
        <button
          onClick={onPrev}
          disabled={page === 0}
          className="px-2 py-1 rounded border border-brand-grey-2 hover:bg-brand-grey-3 disabled:opacity-40"
        >
          Prev
        </button>
        <button
          onClick={onNext}
          disabled={page >= totalPages - 1}
          className="px-2 py-1 rounded border border-brand-grey-2 hover:bg-brand-grey-3 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export default function PlotDataTable({ plots }: PlotDataTableProps) {
  const [page, setPage] = useState(0)

  if (plots.length === 0) {
    return <p className="text-sm text-brand-grey-1">No plot data recorded.</p>
  }

  // Determine whether to use dynamic columns from raw_data or fallback typed columns
  const hasRawData = plots.some(p => p.raw_data && Object.keys(p.raw_data).length > 0)

  const dynamicColumns = useMemo(
    () => hasRawData ? discoverColumns(plots) : [],
    [plots, hasRawData]
  )

  // Build a pre-normalized key lookup per row: column name → value
  // This eliminates the O(cols) per-cell case-insensitive scan.
  const normalizedRowCache = useMemo(() => {
    if (!hasRawData) return null
    const cache = new Map<string, Map<string, any>>()
    for (const p of plots) {
      const raw = p.raw_data || {}
      const normalized = new Map<string, any>()
      for (const [key, val] of Object.entries(raw)) {
        normalized.set(key.toLowerCase().trim(), val)
      }
      cache.set(p.id, normalized)
    }
    return cache
  }, [plots, hasRawData])

  // For treatment enrichment: find which column is the treatment number column
  const trtColumnKey = useMemo(() => {
    if (!hasRawData) return null
    const trtAliases = ['trt', 'treatment', 'trt_number', 'trt_no', 'treatment_number', 'treatment number']
    for (const col of dynamicColumns) {
      if (trtAliases.includes(col.toLowerCase().trim())) return col
    }
    return null
  }, [dynamicColumns, hasRawData])

  const totalPages = Math.ceil(plots.length / PAGE_SIZE)
  const paged = plots.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const pagination = (
    <PaginationBar
      page={page}
      totalPages={totalPages}
      total={plots.length}
      onPrev={() => setPage(p => Math.max(0, p - 1))}
      onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
    />
  )

  if (!hasRawData) {
    // Fallback: render the old static columns from typed DB fields
    return (
      <div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-grey-2">
                {FALLBACK_COLUMNS.map(col => (
                  <th key={col.key} className="table-header text-left py-3 px-3">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((p, i) => (
                <tr key={p.id} className={i % 2 === 1 ? 'bg-brand-grey-3' : ''}>
                  <td className="py-2.5 px-3 font-mono font-medium">{p.plot || '—'}</td>
                  <td className="py-2.5 px-3">
                    {p.treatment_product ? (
                      <ProductTag product={p.treatment_product} />
                    ) : (
                      p.treatment_application || (p.trt_number != null ? `Trt ${p.trt_number}` : '—')
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono">{p.rep ?? '—'}</td>
                  <td className="py-2.5 px-3 font-mono font-bold">{p.yield_t_ha?.toFixed(2) ?? '—'}</td>
                  <td className="py-2.5 px-3 font-mono">{p.plant_count ?? '—'}</td>
                  <td className="py-2.5 px-3 font-mono">{p.vigour ?? '—'}</td>
                  <td className="py-2.5 px-3 font-mono">{p.disease_score ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination}
      </div>
    )
  }

  // Dynamic mode: render all columns discovered from raw_data
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-grey-2">
              {dynamicColumns.map(col => (
                <th key={col} className="table-header text-left py-3 px-3 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((p, i) => {
              const normalized = normalizedRowCache?.get(p.id)
              return (
                <tr key={p.id} className={i % 2 === 1 ? 'bg-brand-grey-3' : ''}>
                  {dynamicColumns.map(col => {
                    // O(1) lookup via pre-normalized cache instead of per-cell scan
                    const val = normalized?.get(col.toLowerCase().trim())

                    // Special treatment enrichment for the treatment column
                    if (col === trtColumnKey && p.treatment_product) {
                      return (
                        <td key={col} className="py-2.5 px-3">
                          <ProductTag product={p.treatment_product} />
                        </td>
                      )
                    }

                    return (
                      <td key={col} className="py-2.5 px-3 font-mono whitespace-nowrap">
                        {formatCellValue(val)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pagination}
    </div>
  )
}
