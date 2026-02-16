'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { Plus } from 'lucide-react'

interface LogEntry {
  id: string
  entry: string
  date: string | null
  created_by: string | null
  created_at: string
}

interface ManagementLogProps {
  entries: LogEntry[]
  trialId: string
  onAdd?: (entry: string, date: string) => void
}

export default function ManagementLog({ entries, trialId, onAdd }: ManagementLogProps) {
  const [showModal, setShowModal] = useState(false)
  const [newEntry, setNewEntry] = useState('')
  const [newDate, setNewDate] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (onAdd && newEntry.trim()) {
      onAdd(newEntry.trim(), newDate)
      setNewEntry('')
      setNewDate('')
      setShowModal(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="signpost-label">Activity Log</p>
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus size={14} />
          Add Entry
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-brand-grey-1">No management entries recorded.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div key={entry.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-brand-grey-3 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-brand-black/50">{i + 1}</span>
                </div>
                {i < entries.length - 1 && (
                  <div className="w-px flex-1 bg-brand-grey-2 mt-1" />
                )}
              </div>
              <div className="pb-4">
                <p className="text-sm text-brand-black">{entry.entry}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-brand-grey-1">
                  {entry.date && <span>{formatDate(entry.date)}</span>}
                  {entry.created_by && <span>by {entry.created_by}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Management Entry">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="signpost-label block mb-1">Entry</label>
            <textarea
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
              required
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30 resize-none"
              placeholder="Describe the activity..."
            />
          </div>
          <div>
            <label className="signpost-label block mb-1">Date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Add Entry</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
