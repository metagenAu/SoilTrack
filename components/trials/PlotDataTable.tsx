import ProductTag from '@/components/ui/ProductTag'

interface PlotDataRow {
  id: string
  plot: string | null
  trt_number: number | null
  rep: number | null
  yield_t_ha: number | null
  plant_count: number | null
  vigour: number | null
  treatment_product?: string | null
  treatment_application?: string | null
}

interface PlotDataTableProps {
  plots: PlotDataRow[]
}

export default function PlotDataTable({ plots }: PlotDataTableProps) {
  if (plots.length === 0) {
    return <p className="text-sm text-brand-grey-1">No plot data recorded.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-grey-2">
            <th className="table-header text-left py-3 px-3">Plot</th>
            <th className="table-header text-left py-3 px-3">Treatment</th>
            <th className="table-header text-left py-3 px-3">Rep</th>
            <th className="table-header text-left py-3 px-3">Yield t/ha</th>
            <th className="table-header text-left py-3 px-3">Plant Count</th>
            <th className="table-header text-left py-3 px-3">Vigour</th>
          </tr>
        </thead>
        <tbody>
          {plots.map((p, i) => (
            <tr
              key={p.id}
              className={i % 2 === 1 ? 'bg-brand-grey-3' : ''}
            >
              <td className="py-2.5 px-3 font-mono font-medium">{p.plot || '—'}</td>
              <td className="py-2.5 px-3">
                {p.treatment_product ? (
                  <ProductTag product={p.treatment_product} />
                ) : (
                  p.treatment_application || `Trt ${p.trt_number}`
                )}
              </td>
              <td className="py-2.5 px-3 font-mono">{p.rep ?? '—'}</td>
              <td className="py-2.5 px-3 font-mono font-bold">{p.yield_t_ha?.toFixed(2) ?? '—'}</td>
              <td className="py-2.5 px-3 font-mono">{p.plant_count ?? '—'}</td>
              <td className="py-2.5 px-3 font-mono">{p.vigour ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
