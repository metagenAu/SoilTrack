'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, FlaskConical } from 'lucide-react'
import Button from '@/components/ui/Button'
import StatusPill from '@/components/ui/StatusPill'
import Link from 'next/link'

interface FieldTrialsPanelProps {
  fieldId: string
  fieldTrials: Array<{
    id: string
    trial_id: string
    season: string | null
    notes: string | null
    trials: {
      id: string
      name: string
      crop: string | null
      status: string
      grower: string | null
      location: string | null
    }
  }>
  allTrials: Array<{
    id: string
    name: string
    crop: string | null
    status: string
    grower: string | null
    location: string | null
  }>
}

export default function FieldTrialsPanel({
  fieldId,
  fieldTrials,
  allTrials,
}: FieldTrialsPanelProps) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [selectedTrialId, setSelectedTrialId] = useState('')
  const [season, setSeason] = useState('')
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter out already-linked trials
  const linkedIds = new Set(fieldTrials.map((ft) => ft.trial_id))
  const availableTrials = allTrials.filter((t) => !linkedIds.has(t.id))

  async function linkTrial() {
    if (!selectedTrialId) return
    setLinking(true)
    setError(null)

    try {
      const res = await fetch(`/api/fields/${fieldId}/trials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trial_id: selectedTrialId,
          season: season.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to link trial')
      }

      setShowAdd(false)
      setSelectedTrialId('')
      setSeason('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLinking(false)
    }
  }

  async function unlinkTrial(trialId: string) {
    if (!confirm('Remove this trial from this field?')) return

    try {
      const res = await fetch(
        `/api/fields/${fieldId}/trials?trial_id=${encodeURIComponent(trialId)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to unlink trial')
      router.refresh()
    } catch {
      // Silently fail — user can retry
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-brand-black">
          Linked Trials ({fieldTrials.length})
        </h3>
        <Button size="sm" variant="secondary" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={13} />
          Link Trial
        </Button>
      </div>

      {showAdd && (
        <div className="mb-4 p-3 bg-brand-grey-3 rounded-lg space-y-3">
          {error && (
            <div className="text-xs text-red-600">{error}</div>
          )}
          <div>
            <label className="block text-xs font-medium text-brand-grey-1 mb-1">
              Select Trial
            </label>
            <select
              value={selectedTrialId}
              onChange={(e) => setSelectedTrialId(e.target.value)}
              className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
            >
              <option value="">-- Choose a trial --</option>
              {availableTrials.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} — {t.name}
                  {t.crop ? ` (${t.crop})` : ''}
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
            <Button size="sm" onClick={linkTrial} disabled={linking || !selectedTrialId}>
              {linking ? 'Linking...' : 'Link'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {fieldTrials.length === 0 ? (
        <p className="text-sm text-brand-grey-1 text-center py-4">
          No trials linked to this field yet.
        </p>
      ) : (
        <div className="space-y-2">
          {fieldTrials.map((ft) => (
            <div
              key={ft.id}
              className="flex items-center justify-between p-3 rounded-lg border border-brand-grey-2 hover:bg-brand-grey-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FlaskConical size={16} className="text-brand-grey-1" />
                <div>
                  <Link
                    href={`/trials/${encodeURIComponent(ft.trial_id)}`}
                    className="text-sm font-medium text-brand-black hover:text-meta-blue"
                  >
                    {ft.trials.name}
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-brand-grey-1 mt-0.5">
                    <span className="font-mono">{ft.trial_id}</span>
                    {ft.trials.crop && <span>{ft.trials.crop}</span>}
                    {ft.season && <span>Season: {ft.season}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={ft.trials.status} />
                <button
                  onClick={() => unlinkTrial(ft.trial_id)}
                  className="text-brand-grey-1 hover:text-red-500 transition-colors"
                  title="Unlink trial"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
