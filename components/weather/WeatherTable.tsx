'use client'

import { useState } from 'react'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import type { WeatherVariable, WeatherDataRow } from '@/lib/weather'

interface WeatherTableProps {
  data: WeatherDataRow[]
  variables: WeatherVariable[]
  frequency: 'daily' | 'hourly'
}

const ROWS_PER_PAGE = 50

export default function WeatherTable({ data, variables, frequency }: WeatherTableProps) {
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(data.length / ROWS_PER_PAGE)
  const pageData = data.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE)

  function formatTime(time: string): string {
    if (frequency === 'hourly') {
      const d = new Date(time)
      return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) +
        ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
    }
    return time
  }

  function downloadCSV() {
    const headers = ['Date/Time', ...variables.map((v) => `${v.label} (${v.unit})`)]
    const rows = data.map((row) => [
      row.time,
      ...variables.map((v) => row[v.key] != null ? String(row[v.key]) : ''),
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `weather_data_${data[0]?.time ?? 'export'}_${data[data.length - 1]?.time ?? ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="text-left px-3 py-2 font-medium">Date/Time</th>
              {variables.map((v) => (
                <th key={v.key} className="text-right px-3 py-2 font-medium whitespace-nowrap">
                  {v.label} <span className="text-brand-grey-1 font-normal">({v.unit})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, i) => (
              <tr key={row.time} className={i % 2 === 1 ? 'bg-brand-grey-3' : ''}>
                <td className="px-3 py-1.5 font-mono text-xs">{formatTime(row.time)}</td>
                {variables.map((v) => (
                  <td key={v.key} className="text-right px-3 py-1.5 font-mono text-xs">
                    {row[v.key] != null ? Number(row[v.key]).toFixed(1) : '\u2014'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-brand-grey-1">
          Page {page + 1} of {totalPages} ({data.length} rows)
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-brand-grey-2 rounded hover:bg-brand-grey-3 transition-colors"
          >
            <Download size={14} />
            Download CSV
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 border border-brand-grey-2 rounded hover:bg-brand-grey-3 transition-colors disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-1.5 border border-brand-grey-2 rounded hover:bg-brand-grey-3 transition-colors disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
