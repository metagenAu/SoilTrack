import { createServerSupabaseClient } from '@/lib/supabase/server'
import PageHeader from '@/components/layout/PageHeader'
import NewFieldForm from '@/components/fields/NewFieldForm'

export const dynamic = 'force-dynamic'

async function getClients() {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('clients')
    .select('id, name, farm')
    .order('name')
  return data || []
}

export default async function NewFieldPage() {
  const clients = await getClients()

  return (
    <div>
      <PageHeader label="FIELD MANAGEMENT" title="New Field" />
      <NewFieldForm clients={clients} />
    </div>
  )
}
