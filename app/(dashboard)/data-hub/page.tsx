import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRole, canUpload } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'
import DataHubClient from './DataHubClient'

export const dynamic = 'force-dynamic'

async function getData() {
  const supabase = createServerSupabaseClient()

  const [trialsRes, logRes] = await Promise.all([
    supabase.from('trials').select('id, name').order('id'),
    supabase.from('upload_log').select('*').order('created_at', { ascending: false }).limit(50),
  ])

  return {
    trials: trialsRes.data || [],
    uploadLog: logRes.data || [],
  }
}

export default async function DataHubPage() {
  const { role } = await getUserRole()

  if (!canUpload(role)) {
    redirect('/dashboard')
  }

  const { trials, uploadLog } = await getData()

  return (
    <div>
      <PageHeader label="DATA MANAGEMENT" title="Data Hub" />
      <DataHubClient trials={trials} uploadLog={uploadLog} />
    </div>
  )
}
