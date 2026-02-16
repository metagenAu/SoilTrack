import ProductTag from '@/components/ui/ProductTag'

interface Treatment {
  id: string
  trt_number: number
  application: string | null
  fertiliser: string | null
  product: string | null
  rate: string | null
  timing: string | null
}

interface TreatmentsTableProps {
  treatments: Treatment[]
}

export default function TreatmentsTable({ treatments }: TreatmentsTableProps) {
  if (treatments.length === 0) {
    return <p className="text-sm text-brand-grey-1">No treatments recorded.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-grey-2">
            <th className="table-header text-left py-3 px-3">Trt</th>
            <th className="table-header text-left py-3 px-3">Application</th>
            <th className="table-header text-left py-3 px-3">Fertiliser</th>
            <th className="table-header text-left py-3 px-3">Product</th>
            <th className="table-header text-left py-3 px-3">Rate</th>
            <th className="table-header text-left py-3 px-3">Timing</th>
          </tr>
        </thead>
        <tbody>
          {treatments.map((t, i) => (
            <tr
              key={t.id}
              className={i % 2 === 1 ? 'bg-brand-grey-3' : ''}
            >
              <td className="py-2.5 px-3 font-mono font-medium">{t.trt_number}</td>
              <td className="py-2.5 px-3">{t.application || '—'}</td>
              <td className="py-2.5 px-3">{t.fertiliser || '—'}</td>
              <td className="py-2.5 px-3">
                {t.product ? <ProductTag product={t.product} /> : '—'}
              </td>
              <td className="py-2.5 px-3 font-mono">{t.rate || '—'}</td>
              <td className="py-2.5 px-3">{t.timing || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
