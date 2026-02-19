'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, MapPin } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'

interface TrialFieldsPanelProps {
  trialId: string
  linkedFields: Array<{
    id: string
    field_id: string
    season: string | null
    notes: string | null
    fields: {
      id: string
      name: string
      farm: string | null
      region: string | null
      area_ha: number | null
      boundary: any | null
    }
  }>
  allFields: Array<{
    id: string
    name: string
    farm: string | null
    region: string | null
    area_ha: number | null
  }>
}

export default function TrialFieldsPanel({
  trialId,
  linkedFields,
  allFields,
}: TrialFieldsPanelProps) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [selectedFieldId, setSelectedFieldId] = useState('')
  const [season, setSeason] = useState('')
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter out already-linked fields
  const linkedIds = new Set(linkedFields.map((lf) => lf.field_id))
  const availableFields = allFields.filter((f) => !linkedIds.has(f.id))

  async function linkField() {
    if (!selectedFieldId) return
    setLinking(true)
    setError(null)

    try {
      const res = await fetch(`/api/trials/${encodeURIComponent(trialId)}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_id: selectedFieldId,
          season: season.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to link field')
      }

      setShowAdd(false)
      setSelectedFieldId('')
      setSeason('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLinking(false)
    }
  }

  async function unlinkField(fieldId: string) {
    if (!confirm('Remove this field from this trial?')) return

    try {
      const res = await fetch(
        `/api/trials/${encodeURIComponent(trialId)}/fields?field_id=${encodeURIComponent(fieldId)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to unlink field')
      router.refresh()
    } catch {
      // Silently fail — user can retry
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-brand-black">
          Linked Fields ({linkedFields.length})
        </h3>
        <Button size="sm" variant="secondary" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={13} />
          Link Field
        </Button>
      </div>

      {showAdd && (
        <div className="mb-4 p-3 bg-brand-grey-3 rounded-lg space-y-3">
          {error && (
            <div className="text-xs text-red-600">{error}</div>
          )}
          <div>
            <label className="block text-xs font-medium text-brand-grey-1 mb-1">
              Select Field
            </label>
            <select
              value={selectedFieldId}
              onChange={(e) => setSelectedFieldId(e.target.value)}
              className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
            >
              <option value="">-- Choose a field --</option>
              {availableFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.farm ? ` — ${f.farm}` : ''}
                  {f.area_ha ? ` (${f.area_ha} ha)` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-grey-1 mb-1">
              Season (optional)
            </label>
            <input
              type="text"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="e.g. 2024"
              className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={linkField} disabled={linking || !selectedFieldId}>
              {linking ? 'Linking...' : 'Link'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {linkedFields.length === 0 ? (
        <p className="text-sm text-brand-grey-1 text-center py-4">
          No fields linked to this trial yet. Link a field to see its boundary on the trial map.
        </p>
      ) : (
        <div className="space-y-2">
          {linkedFields.map((lf) => (
            <div
              key={lf.id}
              className="flex items-center justify-between p-3 rounded-lg border border-brand-grey-2 hover:bg-brand-grey-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <MapPin size={16} className="text-brand-grey-1" />
                <div>
                  <Link
                    href={`/fields/${lf.field_id}`}
                    className="text-sm font-medium text-brand-black hover:text-meta-blue"
                  >
                    {lf.fields.name}
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-brand-grey-1 mt-0.5">
                    {lf.fields.farm && <span>{lf.fields.farm}</span>}
                    {lf.fields.region && <span>{lf.fields.region}</span>}
                    {lf.fields.area_ha != null && <span>{lf.fields.area_ha} ha</span>}
                    {lf.season && <span>Season: {lf.season}</span>}
                    {lf.fields.boundary && (
                      <span className="text-green-600">Boundary set</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => unlinkField(lf.field_id)}
                className="text-brand-grey-1 hover:text-red-500 transition-colors"
                title="Unlink field"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
