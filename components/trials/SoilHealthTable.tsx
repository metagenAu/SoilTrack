import { formatDate } from '@/lib/utils'

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
  if (samples.length === 0) {
    return <p className="text-sm text-brand-grey-1">No soil health samples recorded.</p>
  }

  return (
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
          {samples.map((s, i) => (
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
  )
}
