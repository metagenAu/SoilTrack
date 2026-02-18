'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Maximize2, Plus, X } from 'lucide-react'
import Link from 'next/link'

interface TrialFieldLinkProps {
  trialId: string
  linkedFields: Array<{
    id: string
    field_id: string
    fields: {
      id: string
      name: string
      farm: string | null
      region: string | null
    }
  }>
  allFields: Array<{
    id: string
    name: string
    farm: string | null
    region: string | null
  }>
}

export default function TrialFieldLink({
  trialId,
  linkedFields,
  allFields,
}: TrialFieldLinkProps) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [selectedFieldId, setSelectedFieldId] = useState('')
  const [linking, setLinking] = useState(false)

  const linkedIds = new Set(linkedFields.map((lf) => lf.fields.id))
  const available = allFields.filter((f) => !linkedIds.has(f.id))

  async function linkField() {
    if (!selectedFieldId) return
    setLinking(true)

    try {
      const res = await fetch(`/api/fields/${selectedFieldId}/trials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trial_id: trialId }),
      })

      if (!res.ok) throw new Error('Failed to link')

      setShowAdd(false)
      setSelectedFieldId('')
      router.refresh()
    } catch {
      // silent
    } finally {
      setLinking(false)
    }
  }

  async function unlinkField(fieldId: string) {
    try {
      const res = await fetch(
        `/api/fields/${fieldId}/trials?trial_id=${encodeURIComponent(trialId)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to unlink')
      router.refresh()
    } catch {
      // silent
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="signpost-label">LINKED FIELDS</p>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-brand-grey-1 hover:text-meta-blue transition-colors"
          title="Link to a field"
        >
          <Plus size={14} />
        </button>
      </div>

      {linkedFields.length === 0 && !showAdd && (
        <p className="text-xs text-brand-grey-1">No fields linked</p>
      )}

      {linkedFields.map((lf) => (
        <div
          key={lf.id}
          className="flex items-center justify-between py-1.5"
        >
          <Link
            href={`/fields/${lf.fields.id}`}
            className="flex items-center gap-1.5 text-sm text-brand-black hover:text-meta-blue transition-colors"
          >
            <Maximize2 size={13} className="text-green-600" />
            {lf.fields.name}
            {lf.fields.farm && (
              <span className="text-xs text-brand-grey-1">({lf.fields.farm})</span>
            )}
          </Link>
          <button
            onClick={() => unlinkField(lf.fields.id)}
            className="text-brand-grey-1 hover:text-red-500 transition-colors"
            title="Unlink field"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {showAdd && (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={selectedFieldId}
            onChange={(e) => setSelectedFieldId(e.target.value)}
            className="flex-1 border border-brand-grey-2 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
          >
            <option value="">-- Select field --</option>
            {available.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}{f.farm ? ` (${f.farm})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={linkField}
            disabled={linking || !selectedFieldId}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-meta-blue text-white hover:bg-meta-true-blue disabled:opacity-50 transition-colors"
          >
            {linking ? '...' : 'Link'}
          </button>
          <button
            onClick={() => setShowAdd(false)}
            className="text-xs text-brand-grey-1 hover:text-brand-black"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
