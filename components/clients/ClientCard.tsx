import Link from 'next/link'
import { MapPin, FlaskConical, TestTubes } from 'lucide-react'

interface ClientCardProps {
  client: {
    id: string
    name: string
    farm: string | null
    region: string | null
    trial_count?: number
    sample_count?: number
  }
}

export default function ClientCard({ client }: ClientCardProps) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="card hover:border-brand-grey-1/50 transition-colors group block"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-brand-grey-3 flex items-center justify-center flex-shrink-0">
          <span className="font-semibold text-sm text-brand-black/60">
            {client.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-brand-black group-hover:text-brand-black/70 transition-colors">
            {client.name}
          </h3>
          <div className="flex items-center gap-3 text-xs text-brand-grey-1 mt-1">
            {client.farm && (
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {client.farm}
              </span>
            )}
            {client.region && <span>{client.region}</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-brand-grey-1 mt-2">
            <span className="flex items-center gap-1">
              <FlaskConical size={12} />
              {client.trial_count || 0} trials
            </span>
            <span className="flex items-center gap-1">
              <TestTubes size={12} />
              {client.sample_count || 0} samples
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
