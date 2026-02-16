import { createServerSupabaseClient } from '@/lib/supabase/server'
import PageHeader from '@/components/layout/PageHeader'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

async function getSettingsData() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  return { user }
}

export default async function SettingsPage() {
  const { user } = await getSettingsData()

  return (
    <div>
      <PageHeader label="CONFIGURATION" title="Settings" />
      <SettingsClient user={user} />
    </div>
  )
}
