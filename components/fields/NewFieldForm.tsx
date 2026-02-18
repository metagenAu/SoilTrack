'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'

interface NewFieldFormProps {
  clients: { id: string; name: string; farm: string | null }[]
}

export default function NewFieldForm({ clients }: NewFieldFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [region, setRegion] = useState('')
  const [farm, setFarm] = useState('')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Field name is required')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          client_id: clientId || null,
          region: region.trim() || null,
          farm: farm.trim() || null,
          notes: notes.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create field')
      }

      const field = await res.json()
      router.push(`/fields/${field.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-xl space-y-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-brand-grey-1 mb-1">
          Field Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
          placeholder="e.g. North Paddock"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-brand-grey-1 mb-1">
          Client / Grower
        </label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
        >
          <option value="">-- None --</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.farm ? ` (${c.farm})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-brand-grey-1 mb-1">
            Farm
          </label>
          <input
            type="text"
            value={farm}
            onChange={(e) => setFarm(e.target.value)}
            className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-grey-1 mb-1">
            Region
          </label>
          <input
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-brand-grey-1 mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Creating...' : 'Create Field'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push('/fields')}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
