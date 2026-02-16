import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'
import TrialCard from '@/components/trials/TrialCard'
import { MapPin, Mail, Phone } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getClientData(id: string) {
  const supabase = createServerSupabaseClient()

  const [clientRes, trialsRes, samplesRes, treatmentsRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('trials').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('soil_health_samples').select('id, trial_id'),
    supabase.from('treatments').select('trial_id, product'),
  ])

  if (clientRes.error || !clientRes.data) return null

  const trials = trialsRes.data || []
  const samples = samplesRes.data || []
  const treatments = treatmentsRes.data || []

  const samplesByTrial: Record<string, number> = {}
  for (const s of samples) {
    samplesByTrial[s.trial_id] = (samplesByTrial[s.trial_id] || 0) + 1
  }

  const productsByTrial: Record<string, Set<string>> = {}
  for (const t of treatments) {
    if (!productsByTrial[t.trial_id]) productsByTrial[t.trial_id] = new Set()
    if (t.product) productsByTrial[t.trial_id].add(t.product)
  }

  const trialsWithMeta = trials.map((t) => ({
    ...t,
    sample_count: samplesByTrial[t.id] || 0,
    products: Array.from(productsByTrial[t.id] || []),
  }))

  return {
    client: clientRes.data,
    trials: trialsWithMeta,
  }
}

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const data = await getClientData(params.id)
  if (!data) notFound()

  const { client, trials } = data

  return (
    <div>
      <PageHeader label="CLIENT" title={client.name} />

      {/* Client info card */}
      <div className="card mb-6">
        <div className="flex items-center gap-6 text-sm text-brand-grey-1">
          {client.farm && (
            <span className="flex items-center gap-1.5">
              <MapPin size={14} />
              {client.farm}
            </span>
          )}
          {client.region && <span>{client.region}</span>}
          {client.email && (
            <span className="flex items-center gap-1.5">
              <Mail size={14} />
              {client.email}
            </span>
          )}
          {client.phone && (
            <span className="flex items-center gap-1.5">
              <Phone size={14} />
              {client.phone}
            </span>
          )}
        </div>
        {client.notes && (
          <p className="text-sm text-brand-black/70 mt-3">{client.notes}</p>
        )}
      </div>

      {/* Client trials */}
      <p className="signpost-label mb-4">LINKED TRIALS</p>
      <div className="space-y-3">
        {trials.map((trial) => (
          <TrialCard key={trial.id} trial={trial} />
        ))}
        {trials.length === 0 && (
          <div className="card text-center py-8">
            <p className="text-sm text-brand-grey-1">No trials linked to this client.</p>
          </div>
        )}
      </div>
    </div>
  )
}
