import { createServerSupabaseClient } from '@/lib/supabase/server'
import PageHeader from '@/components/layout/PageHeader'
import StatCard from '@/components/ui/StatCard'
import TrialCard from '@/components/trials/TrialCard'
import ProductTag from '@/components/ui/ProductTag'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getDashboardData() {
  const supabase = createServerSupabaseClient()

  const [trialsRes, clientCountRes, sampleCountRes, samplesRes, treatmentsRes] = await Promise.all([
    supabase.from('trials').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('soil_health_samples').select('*', { count: 'exact', head: true }),
    supabase.from('soil_health_samples').select('trial_id'),
    supabase.from('treatments').select('trial_id, product'),
  ])

  const trials = trialsRes.data || []
  const samples = samplesRes.data || []
  const treatments = treatmentsRes.data || []

  const activeTrials = trials.filter((t) => t.status === 'active').length
  const completedTrials = trials.filter((t) => t.status === 'completed').length

  // Count samples per trial
  const samplesByTrial: Record<string, number> = {}
  for (const s of samples) {
    samplesByTrial[s.trial_id] = (samplesByTrial[s.trial_id] || 0) + 1
  }

  // Get unique products per trial
  const productsByTrial: Record<string, Set<string>> = {}
  for (const t of treatments) {
    if (!productsByTrial[t.trial_id]) productsByTrial[t.trial_id] = new Set()
    if (t.product) productsByTrial[t.trial_id].add(t.product)
  }

  // Product trial counts
  const productTrialCounts: Record<string, number> = {}
  for (const [, products] of Object.entries(productsByTrial)) {
    for (const p of products) {
      if (p !== 'Control') {
        productTrialCounts[p] = (productTrialCounts[p] || 0) + 1
      }
    }
  }

  const trialsWithMeta = trials.map((t) => ({
    ...t,
    sample_count: samplesByTrial[t.id] || 0,
    products: Array.from(productsByTrial[t.id] || []),
  }))

  return {
    trials: trialsWithMeta,
    activeTrials,
    completedTrials,
    totalSamples: sampleCountRes.count ?? 0,
    totalClients: clientCountRes.count ?? 0,
    productTrialCounts,
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div>
      <PageHeader label="OVERVIEW" title="Dashboard" />

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="ACTIVE TRIALS" value={data.activeTrials} borderColor="#B9BCBF" />
        <StatCard label="COMPLETED" value={data.completedTrials} borderColor="#DCDDDF" />
        <StatCard label="SOIL SAMPLES" value={data.totalSamples} borderColor="#B9BCBF" />
        <StatCard label="CLIENTS" value={data.totalClients} borderColor="#DCDDDF" />
      </div>

      {/* Products Under Trial */}
      <div className="card mb-6">
        <p className="signpost-label mb-3">PRODUCTS UNDER TRIAL</p>
        <div className="flex gap-4">
          {Object.entries(data.productTrialCounts).map(([product, count]) => (
            <div key={product} className="flex items-center gap-2">
              <ProductTag product={product} />
              <span className="text-sm text-brand-grey-1">{count} trial{count !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      </div>

      {/* All Trials */}
      <div className="flex items-center justify-between mb-4">
        <p className="signpost-label">ALL TRIALS</p>
        <Link href="/trials">
          <Button size="sm" variant="secondary">View All</Button>
        </Link>
      </div>
      <div className="space-y-3">
        {data.trials.map((trial) => (
          <TrialCard key={trial.id} trial={trial} />
        ))}
        {data.trials.length === 0 && (
          <div className="card text-center py-8">
            <p className="text-sm text-brand-grey-1">No trials yet. Upload trial data from the Data Hub to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}
