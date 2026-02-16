import { createServerSupabaseClient } from '@/lib/supabase/server'
import PageHeader from '@/components/layout/PageHeader'
import ReportsClient from './ReportsClient'

export const dynamic = 'force-dynamic'

async function getReportData() {
  const supabase = createServerSupabaseClient()

  const [trialsRes] = await Promise.all([
    supabase.from('trials').select('id, name').order('id'),
  ])

  return {
    trials: trialsRes.data || [],
  }
}

export default async function ReportsPage() {
  const { trials } = await getReportData()

  return (
    <div>
      <PageHeader label="REPORTING" title="Reports" />
      <ReportsClient trials={trials} />
    </div>
  )
}
