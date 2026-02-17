import { createServerSupabaseClient } from '@/lib/supabase/server'
import PageHeader from '@/components/layout/PageHeader'
import TrialCard from '@/components/trials/TrialCard'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getTrials() {
  const supabase = createServerSupabaseClient()

  const [trialsRes, samplesRes, treatmentsRes] = await Promise.all([
    supabase.from('trials').select('*').order('created_at', { ascending: false }),
    supabase.from('soil_health_samples').select('id, trial_id'),
    supabase.from('treatments').select('trial_id, product'),
  ])

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

  return trials.map((t) => ({
    ...t,
    sample_count: samplesByTrial[t.id] || 0,
    products: Array.from(productsByTrial[t.id] || []),
  }))
}

export default async function TrialsPage() {
  const trials = await getTrials()

  return (
    <div>
      <PageHeader
        label="TRIAL MANAGEMENT"
        title="All Trials"
        action={
          <Link href="/data-hub">
            <Button size="sm">
              <Plus size={14} />
              Add Trial
            </Button>
          </Link>
        }
      />

      <div className="space-y-3">
        {trials.map((trial) => (
          <TrialCard key={trial.id} trial={trial} />
        ))}
        {trials.length === 0 && (
          <div className="card text-center py-8">
            <p className="text-sm text-brand-grey-1">No trials yet. Upload trial data from the Data Hub to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}
