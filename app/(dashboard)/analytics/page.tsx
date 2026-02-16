import { createServerSupabaseClient } from '@/lib/supabase/server'
import PageHeader from '@/components/layout/PageHeader'
import AnalyticsDashboard from './AnalyticsDashboard'

export const dynamic = 'force-dynamic'

async function getAnalyticsData() {
  const supabase = createServerSupabaseClient()

  const [trialsRes, clientCountRes, sampleCountRes, samplesRes] = await Promise.all([
    supabase.from('trials').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('soil_health_samples').select('*', { count: 'exact', head: true }),
    supabase.from('soil_health_samples').select('trial_id'),
  ])

  const trials = trialsRes.data || []
  const sampleCounts: Record<string, number> = {}
  for (const s of (samplesRes.data || [])) {
    sampleCounts[s.trial_id] = (sampleCounts[s.trial_id] || 0) + 1
  }

  return {
    trials: trials.map((t) => ({
      id: t.id,
      name: t.name,
      crop: t.crop || null,
      location: t.location || null,
      gps: t.gps || null,
      status: t.status || 'active',
      trial_type: t.trial_type || null,
      planting_date: t.planting_date || null,
      harvest_date: t.harvest_date || null,
      created_at: t.created_at,
      sample_count: sampleCounts[t.id] || 0,
    })),
    totalClients: clientCountRes.count ?? 0,
    totalSamples: sampleCountRes.count ?? 0,
  }
}

export default async function AnalyticsPage() {
  const data = await getAnalyticsData()

  return (
    <div>
      <PageHeader label="INSIGHTS" title="Analytics" />
      <AnalyticsDashboard
        trials={data.trials}
        totalClients={data.totalClients}
        totalSamples={data.totalSamples}
      />
    </div>
  )
}
