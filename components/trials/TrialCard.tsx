import Link from 'next/link'
import StatusPill from '@/components/ui/StatusPill'
import ProductTag from '@/components/ui/ProductTag'

interface Trial {
  id: string
  name: string
  grower: string | null
  crop: string | null
  location: string | null
  status: string
  num_treatments: number
  sample_count?: number
  products?: string[]
}

interface TrialCardProps {
  trial: Trial
}

export default function TrialCard({ trial }: TrialCardProps) {
  return (
    <Link
      href={`/trials/${encodeURIComponent(trial.id)}`}
      className="card hover:border-meta-blue/40 transition-colors group block"
    >
      <div className="flex items-start gap-3">
        {/* Circle avatar */}
        <div className="w-10 h-10 rounded-full bg-meta-blue/10 flex items-center justify-center flex-shrink-0">
          <span className="font-mono text-xs font-bold text-meta-blue">
            {trial.id}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-brand-black truncate group-hover:text-meta-blue transition-colors">
              {trial.name}
            </h3>
            <StatusPill status={trial.status} />
          </div>

          <div className="flex items-center gap-3 text-xs text-brand-grey-1">
            {trial.grower && <span>{trial.grower}</span>}
            {trial.crop && <span>{trial.crop}</span>}
            {trial.location && <span>{trial.location}</span>}
          </div>

          {trial.products && trial.products.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {trial.products.map((p) => (
                <ProductTag key={p} product={p} />
              ))}
            </div>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-xs text-brand-grey-1">{trial.num_treatments} treatments</p>
          {trial.sample_count !== undefined && (
            <p className="text-xs text-brand-grey-1">{trial.sample_count} samples</p>
          )}
        </div>
      </div>
    </Link>
  )
}
