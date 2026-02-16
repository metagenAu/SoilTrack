import { createServerSupabaseClient } from '@/lib/supabase/server'
import PageHeader from '@/components/layout/PageHeader'
import AnalysisClient from './AnalysisClient'

export const dynamic = 'force-dynamic'

async function getData() {
  const supabase = createServerSupabaseClient()

  const [trialsRes, assayTypesRes] = await Promise.all([
    supabase.from('trials').select('id, name').order('id'),
    supabase.from('sample_metadata').select('assay_type').limit(1000),
  ])

  // Extract unique assay types
  const assayTypes = [...new Set((assayTypesRes.data || []).map(r => r.assay_type))].sort()

  return {
    trials: trialsRes.data || [],
    assayTypes,
  }
}

export default async function AnalysisPage() {
  const { trials, assayTypes } = await getData()

  return (
    <div>
      <PageHeader label="DATA ANALYSIS" title="Analysis" />
      <AnalysisClient trials={trials} assayTypes={assayTypes} />
    </div>
  )
}
