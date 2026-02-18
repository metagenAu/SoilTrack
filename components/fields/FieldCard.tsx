import Link from 'next/link'
import { MapPin, FlaskConical, Maximize2 } from 'lucide-react'

interface FieldCardProps {
  field: {
    id: string
    name: string
    farm: string | null
    region: string | null
    area_ha: number | null
    client_name?: string | null
    trial_count?: number
    has_boundary?: boolean
  }
}

export default function FieldCard({ field }: FieldCardProps) {
  return (
    <Link
      href={`/fields/${field.id}`}
      className="card hover:border-brand-grey-1/50 transition-colors group block"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
          <Maximize2 size={16} className="text-green-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-brand-black group-hover:text-brand-black/70 transition-colors">
            {field.name}
          </h3>
          <div className="flex items-center gap-3 text-xs text-brand-grey-1 mt-1">
            {field.farm && (
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {field.farm}
              </span>
            )}
            {field.region && <span>{field.region}</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-brand-grey-1 mt-2">
            {field.area_ha != null && (
              <span>{field.area_ha} ha</span>
            )}
            <span className="flex items-center gap-1">
              <FlaskConical size={12} />
              {field.trial_count || 0} trials
            </span>
            {field.client_name && (
              <span className="text-brand-black/40">{field.client_name}</span>
            )}
          </div>
          {field.has_boundary && (
            <span className="inline-block mt-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-50 text-green-700">
              Boundary set
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
