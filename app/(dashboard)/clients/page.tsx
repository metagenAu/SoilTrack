import { createServerSupabaseClient } from '@/lib/supabase/server'
import PageHeader from '@/components/layout/PageHeader'
import ClientCard from '@/components/clients/ClientCard'
import Button from '@/components/ui/Button'
import { Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getClients() {
  const supabase = createServerSupabaseClient()

  const [clientsRes, trialsRes, samplesRes] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('trials').select('id, client_id'),
    supabase.from('soil_health_samples').select('id, trial_id'),
  ])

  const clients = clientsRes.data || []
  const trials = trialsRes.data || []
  const samples = samplesRes.data || []

  // Count trials per client
  const trialsByClient: Record<string, number> = {}
  const trialIdsByClient: Record<string, Set<string>> = {}
  for (const t of trials) {
    if (t.client_id) {
      trialsByClient[t.client_id] = (trialsByClient[t.client_id] || 0) + 1
      if (!trialIdsByClient[t.client_id]) trialIdsByClient[t.client_id] = new Set()
      trialIdsByClient[t.client_id].add(t.id)
    }
  }

  // Count samples per client (through trials)
  const samplesByTrial: Record<string, number> = {}
  for (const s of samples) {
    samplesByTrial[s.trial_id] = (samplesByTrial[s.trial_id] || 0) + 1
  }

  return clients.map((c) => {
    const clientTrialIds = trialIdsByClient[c.id] || new Set()
    let sampleCount = 0
    for (const tid of clientTrialIds) {
      sampleCount += samplesByTrial[tid] || 0
    }
    return {
      ...c,
      trial_count: trialsByClient[c.id] || 0,
      sample_count: sampleCount,
    }
  })
}

export default async function ClientsPage() {
  const clients = await getClients()

  return (
    <div>
      <PageHeader
        label="CLIENT MANAGEMENT"
        title="Clients"
        action={
          <Button size="sm">
            <Plus size={14} />
            Add Client
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        {clients.map((client) => (
          <ClientCard key={client.id} client={client} />
        ))}
        {clients.length === 0 && (
          <div className="col-span-3 card text-center py-8">
            <p className="text-sm text-brand-grey-1">No clients yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
