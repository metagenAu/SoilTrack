'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils'

const PAGE_SIZE = 50

interface SoilHealthSample {
  id: string
  sample_no: string | null
  date: string | null
  property: string | null
  block: string | null
}

interface SoilHealthTableProps {
  samples: SoilHealthSample[]
}

export default function SoilHealthTable({ samples }: SoilHealthTableProps) {
  const [page, setPage] = useState(0)

  if (samples.length === 0) {
    return <p className="text-sm text-brand-grey-1">No soil health samples recorded.</p>
  }

  const totalPages = Math.ceil(samples.length / PAGE_SIZE)
  const paged = samples.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-grey-2">
              <th className="table-header text-left py-3 px-3">Sample No</th>
              <th className="table-header text-left py-3 px-3">Date</th>
              <th className="table-header text-left py-3 px-3">Property</th>
              <th className="table-header text-left py-3 px-3">Block / Treatment</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((s, i) => (
              <tr
                key={s.id}
                className={i % 2 === 1 ? 'bg-brand-grey-3' : ''}
              >
                <td className="py-2.5 px-3 font-mono font-medium">{s.sample_no || '—'}</td>
                <td className="py-2.5 px-3">{formatDate(s.date)}</td>
                <td className="py-2.5 px-3">{s.property || '—'}</td>
                <td className="py-2.5 px-3">{s.block || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-brand-grey-1">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, samples.length)} of {samples.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded border border-brand-grey-2 hover:bg-brand-grey-3 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded border border-brand-grey-2 hover:bg-brand-grey-3 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
