'use client'

import { useState, useRef } from 'react'
import {
  Plus, Trash2, Loader2, Download, Upload, MapPin, Edit3, Check,
  X, ChevronDown, ChevronRight, Database, Layers, FileDown
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

export interface PointSet {
  id: string
  trial_id: string
  name: string
  description: string | null
  source: string
  status: string
  parameters: any
  style: { color: string; radius: number } | null
  sample_points: SamplePoint[]
  point_data_layers: DataLayer[]
  created_at: string
  updated_at: string
}

export interface SamplePoint {
  id: string
  set_id: string
  label: string
  latitude: number
  longitude: number
  notes: string | null
  properties: Record<string, any>
  sort_order: number
}

export interface DataLayer {
  id: string
  set_id: string
  name: string
  unit: string | null
  source: string
  source_metadata: any
  point_data_values?: DataValue[]
}

export interface DataValue {
  id: string
  layer_id: string
  point_id: string
  value: number | null
  text_value: string | null
}

const SET_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

interface SamplePointSetPanelProps {
  trialId: string
  pointSets: PointSet[]
  activeSetId: string | null
  onSelectSet: (setId: string | null) => void
  onSetsChange: (sets: PointSet[]) => void
  onStartDrawing: () => void
  onImportCSV: (setId: string) => void
  hasExistingSamples: boolean
}

export default function SamplePointSetPanel({
  trialId,
  pointSets,
  activeSetId,
  onSelectSet,
  onSetsChange,
  onStartDrawing,
  onImportCSV,
  hasExistingSamples,
}: SamplePointSetPanelProps) {
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [newSetDescription, setNewSetDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function handleCreate() {
    if (!newSetName.trim()) return
    setCreating(true)

    try {
      const res = await fetch('/api/sample-point-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trial_id: trialId,
          name: newSetName.trim(),
          description: newSetDescription.trim() || null,
          style: { color: SET_COLORS[pointSets.length % SET_COLORS.length], radius: 7 },
        }),
      })

      if (!res.ok) throw new Error('Failed to create set')

      const { set } = await res.json()
      const newSet = { ...set, sample_points: [], point_data_layers: [] }
      onSetsChange([...pointSets, newSet])
      onSelectSet(newSet.id)
      setShowCreateModal(false)
      setNewSetName('')
      setNewSetDescription('')
    } catch (err) {
      console.error('Create set failed:', err)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(setId: string) {
    setDeleting(setId)
    try {
      const res = await fetch(`/api/sample-point-sets/${setId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      const updated = pointSets.filter(s => s.id !== setId)
      onSetsChange(updated)
      if (activeSetId === setId) onSelectSet(null)
    } catch (err) {
      console.error('Delete set failed:', err)
    } finally {
      setDeleting(null)
    }
  }

  async function handleRename(setId: string) {
    if (!editName.trim()) return
    try {
      const res = await fetch(`/api/sample-point-sets/${setId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (!res.ok) throw new Error('Rename failed')
      onSetsChange(pointSets.map(s => s.id === setId ? { ...s, name: editName.trim() } : s))
      setEditingId(null)
    } catch (err) {
      console.error('Rename failed:', err)
    }
  }

  async function handleExport(setId: string, format: 'csv' | 'geojson') {
    setExporting(setId)
    try {
      const res = await fetch(`/api/sample-point-sets/${setId}/export?format=${format}`)
      if (!res.ok) throw new Error('Export failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const set = pointSets.find(s => s.id === setId)
      const ext = format === 'csv' ? 'csv' : 'geojson'
      a.download = `${set?.name || 'sample-points'}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(null)
    }
  }

  async function handleImportExisting(setId: string) {
    setImporting(setId)
    try {
      const res = await fetch(`/api/sample-point-sets/${setId}/import-existing`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Import failed')
      }

      const { points, imported, skipped } = await res.json()
      onSetsChange(pointSets.map(s => {
        if (s.id !== setId) return s
        return { ...s, sample_points: [...s.sample_points, ...points] }
      }))
      alert(`Imported ${imported} GPS points${skipped > 0 ? ` (${skipped} duplicates skipped)` : ''}`)
    } catch (err: any) {
      console.error('Import existing failed:', err)
      alert(err.message || 'Import failed')
    } finally {
      setImporting(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="signpost-label">SAMPLE POINT SETS</p>
        <Button size="sm" onClick={() => setShowCreateModal(true)}>
          <Plus size={14} />
          New Set
        </Button>
      </div>

      {pointSets.length === 0 && (
        <div className="text-center py-6 text-brand-grey-1">
          <MapPin size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium mb-1">No sample point sets yet</p>
          <p className="text-xs">Create a set to start placing GPS points on the map.</p>
        </div>
      )}

      {pointSets.map((set, idx) => {
        const color = set.style?.color || SET_COLORS[idx % SET_COLORS.length]
        const isActive = activeSetId === set.id
        const isExpanded = expandedId === set.id

        return (
          <div
            key={set.id}
            className={`rounded-lg border transition-colors ${
              isActive
                ? 'border-meta-blue bg-blue-50/30'
                : 'border-brand-grey-2 bg-white hover:border-brand-grey-1'
            }`}
          >
            {/* Set header */}
            <div className="flex items-center gap-2 p-3">
              <button
                onClick={() => setExpandedId(isExpanded ? null : set.id)}
                className="text-brand-grey-1 hover:text-brand-black"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />

              <button
                className="flex-1 text-left"
                onClick={() => onSelectSet(isActive ? null : set.id)}
              >
                {editingId === set.id ? (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(set.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="text-sm font-medium border border-brand-grey-2 rounded px-2 py-0.5 w-full"
                    />
                    <button onClick={() => handleRename(set.id)} className="text-green-lush">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-brand-grey-1">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium">{set.name}</p>
                    <p className="text-xs text-brand-grey-1">
                      {set.sample_points.length} point{set.sample_points.length !== 1 ? 's' : ''}
                      {set.point_data_layers.length > 0 && (
                        <> &middot; {set.point_data_layers.length} layer{set.point_data_layers.length !== 1 ? 's' : ''}</>
                      )}
                    </p>
                  </div>
                )}
              </button>

              {editingId !== set.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingId(set.id); setEditName(set.name) }}
                    className="p-1 rounded text-brand-grey-1 hover:text-brand-black hover:bg-brand-grey-3"
                    title="Rename"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(set.id)}
                    disabled={deleting === set.id}
                    className="p-1 rounded text-brand-grey-1 hover:text-red-500 hover:bg-red-50"
                    title="Delete set"
                  >
                    {deleting === set.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              )}
            </div>

            {/* Expanded actions */}
            {isExpanded && (
              <div className="px-3 pb-3 pt-0 border-t border-brand-grey-2 space-y-2">
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { onSelectSet(set.id); onStartDrawing() }}
                  >
                    <MapPin size={12} />
                    Draw Points
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onImportCSV(set.id)}
                  >
                    <Upload size={12} />
                    Import CSV
                  </Button>
                  {hasExistingSamples && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleImportExisting(set.id)}
                      disabled={importing === set.id}
                    >
                      {importing === set.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Database size={12} />
                      )}
                      Log Existing GPS
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleExport(set.id, 'csv')}
                    disabled={exporting === set.id || set.sample_points.length === 0}
                  >
                    {exporting === set.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <FileDown size={12} />
                    )}
                    Export CSV
                  </Button>
                </div>

                {set.sample_points.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleExport(set.id, 'geojson')}
                    className="w-full"
                    disabled={exporting === set.id}
                  >
                    <Download size={12} />
                    Export GeoJSON
                  </Button>
                )}

                {set.description && (
                  <p className="text-xs text-brand-grey-1 mt-1">{set.description}</p>
                )}

                {/* Point list */}
                {set.sample_points.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-brand-grey-1 mb-1">
                      Points ({set.sample_points.length})
                    </p>
                    <div className="max-h-32 overflow-y-auto space-y-0.5">
                      {set.sample_points
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map(p => (
                        <div key={p.id} className="flex items-center justify-between text-xs px-1 py-0.5 rounded hover:bg-brand-grey-3">
                          <span className="font-mono font-medium">{p.label}</span>
                          <span className="text-brand-grey-1 font-mono">
                            {Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data layers summary */}
                {set.point_data_layers.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-brand-grey-1 mb-1">
                      Data Layers
                    </p>
                    {set.point_data_layers.map(layer => (
                      <div key={layer.id} className="flex items-center gap-2 text-xs px-1 py-0.5">
                        <Layers size={10} className="text-brand-grey-1" />
                        <span>{layer.name}</span>
                        {layer.unit && <span className="text-brand-grey-1">({layer.unit})</span>}
                        <span className="text-brand-grey-1 text-[10px] ml-auto">{layer.source}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); setNewSetName(''); setNewSetDescription('') }}
        title="New Sample Point Set"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Set Name</label>
            <input
              autoFocus
              value={newSetName}
              onChange={e => setNewSetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              placeholder="e.g. Pre-plant soil sampling"
              className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-meta-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description <span className="text-brand-grey-1 font-normal">(optional)</span></label>
            <input
              value={newSetDescription}
              onChange={e => setNewSetDescription(e.target.value)}
              placeholder="e.g. 50m grid, 0-30cm depth"
              className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-meta-blue"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newSetName.trim()}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Set
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
