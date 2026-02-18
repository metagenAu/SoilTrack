import { createServerSupabaseClient } from '@/lib/supabase/server'
import PageHeader from '@/components/layout/PageHeader'
import FieldCard from '@/components/fields/FieldCard'
import Button from '@/components/ui/Button'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getFields() {
  const supabase = createServerSupabaseClient()

  const [fieldsRes, fieldTrialsRes, clientsRes] = await Promise.all([
    supabase.from('fields').select('*').order('name'),
    supabase.from('field_trials').select('field_id, trial_id'),
    supabase.from('clients').select('id, name'),
  ])

  const fields = fieldsRes.data || []
  const fieldTrials = fieldTrialsRes.data || []
  const clients = clientsRes.data || []

  const clientMap = new Map(clients.map((c) => [c.id, c.name]))

  // Count trials per field
  const trialsByField: Record<string, number> = {}
  for (const ft of fieldTrials) {
    trialsByField[ft.field_id] = (trialsByField[ft.field_id] || 0) + 1
  }

  return fields.map((f) => ({
    ...f,
    client_name: f.client_id ? clientMap.get(f.client_id) || null : null,
    trial_count: trialsByField[f.id] || 0,
    has_boundary: f.boundary != null && f.boundary?.features?.length > 0,
  }))
}

export default async function FieldsPage() {
  const fields = await getFields()

  return (
    <div>
      <PageHeader
        label="FIELD MANAGEMENT"
        title="Fields"
        action={
          <Link href="/fields/new">
            <Button size="sm">
              <Plus size={14} />
              New Field
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        {fields.map((field) => (
          <FieldCard key={field.id} field={field} />
        ))}
        {fields.length === 0 && (
          <div className="col-span-3 card text-center py-8">
            <p className="text-sm text-brand-grey-1">
              No fields yet. Create your first field to define canonical boundaries and link to trials.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
