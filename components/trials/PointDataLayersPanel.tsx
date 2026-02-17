'use client'

import { useState, useRef } from 'react'
import { Plus, Trash2, Loader2, Layers, Upload, Satellite } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import type { PointSet, DataLayer, SamplePoint } from './SamplePointSetPanel'

interface PointDataLayersPanelProps {
  activeSet: PointSet | null
  onSetUpdate: (set: PointSet) => void
}

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'csv_import', label: 'CSV Import' },
  { value: 'lab_result', label: 'Lab Result' },
  { value: 'sensor', label: 'Sensor Data' },
  { value: 'ndvi', label: 'NDVI (future)' },
  { value: 'satellite', label: 'Satellite (future)' },
  { value: 'other', label: 'Other' },
]

export default function PointDataLayersPanel({
  activeSet,
  onSetUpdate,
}: PointDataLayersPanelProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCSVModal, setShowCSVModal] = useState(false)
  const [layerName, setLayerName] = useState('')
  const [layerUnit, setLayerUnit] = useState('')
  const [layerSource, setLayerSource] = useState('manual')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [csvLayerId, setCsvLayerId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!activeSet) {
    return (
      <div className="text-center py-4 text-brand-grey-1">
        <Layers size={24} className="mx-auto mb-2 opacity-40" />
        <p className="text-xs">Select a point set to manage data layers</p>
      </div>
    )
  }

  async function handleCreateLayer() {
    if (!layerName.trim() || !activeSet) return
    setCreating(true)

    try {
      const res = await fetch(`/api/sample-point-sets/${activeSet.id}/layers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: layerName.trim(),
          unit: layerUnit.trim() || null,
          source: layerSource,
        }),
      })

      if (!res.ok) throw new Error('Failed to create layer')
      const { layer } = await res.json()

      onSetUpdate({
        ...activeSet,
        point_data_layers: [...activeSet.point_data_layers, { ...layer, point_data_values: [] }],
      })

      setShowCreateModal(false)
      setLayerName('')
      setLayerUnit('')
      setLayerSource('manual')
    } catch (err) {
      console.error('Create layer failed:', err)
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteLayer(layerId: string) {
    if (!activeSet) return
    setDeleting(layerId)

    try {
      const res = await fetch(`/api/sample-point-sets/${activeSet.id}/layers/${layerId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Delete failed')

      onSetUpdate({
        ...activeSet,
        point_data_layers: activeSet.point_data_layers.filter(l => l.id !== layerId),
      })
    } catch (err) {
      console.error('Delete layer failed:', err)
    } finally {
      setDeleting(null)
    }
  }

  async function handleCSVUpload(file: File, layerId: string) {
    const text = await file.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) {
      alert('CSV must have a header row and at least one data row')
      return
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const labelCol = headers.findIndex(h => ['label', 'point', 'sample', 'sample_no', 'id', 'name'].includes(h))
    const valueCol = headers.findIndex(h => ['value', 'reading', 'measurement', 'result'].includes(h))

    if (labelCol === -1) {
      alert('CSV must have a "label" or "sample_no" column to match points')
      return
    }

    // Build a map of label -> point_id
    const pointMap = new Map(
      activeSet!.sample_points.map(p => [p.label.toLowerCase(), p.id])
    )

    const values: { point_id: string; value?: number; text_value?: string }[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const label = cols[labelCol]?.toLowerCase()
      const pointId = pointMap.get(label)
      if (!pointId) continue

      const rawValue = valueCol !== -1 ? cols[valueCol] : cols[labelCol === 0 ? 1 : 0]
      const numValue = parseFloat(rawValue)
      values.push({
        point_id: pointId,
        value: isNaN(numValue) ? undefined : numValue,
        text_value: isNaN(numValue) ? rawValue : undefined,
      })
    }

    if (values.length === 0) {
      alert('No matching points found in CSV. Check that labels match point labels.')
      return
    }

    try {
      const res = await fetch(`/api/sample-point-sets/${activeSet!.id}/layers/${layerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      })

      if (!res.ok) throw new Error('Upload values failed')
      const { layer } = await res.json()

      onSetUpdate({
        ...activeSet!,
        point_data_layers: activeSet!.point_data_layers.map(l => l.id === layerId ? layer : l),
      })

      alert(`Imported ${values.length} values`)
    } catch (err) {
      console.error('CSV layer import failed:', err)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="signpost-label">DATA LAYERS — {activeSet.name}</p>
        <Button size="sm" variant="secondary" onClick={() => setShowCreateModal(true)}>
          <Plus size={12} />
          Add Layer
        </Button>
      </div>

      {activeSet.point_data_layers.length === 0 ? (
        <div className="text-center py-4 text-brand-grey-1">
          <p className="text-xs">No data layers yet. Add a layer to associate data with points.</p>
          <p className="text-[10px] mt-1 text-brand-grey-1">
            Future: NDVI, satellite imagery, sensor data can be added as layers.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeSet.point_data_layers.map(layer => {
            const valueCount = layer.point_data_values?.length || 0
            return (
              <div key={layer.id} className="flex items-center justify-between p-2 rounded-lg border border-brand-grey-2 bg-white">
                <div className="flex items-center gap-2">
                  {layer.source === 'ndvi' || layer.source === 'satellite' ? (
                    <Satellite size={14} className="text-meta-blue" />
                  ) : (
                    <Layers size={14} className="text-brand-grey-1" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{layer.name}</p>
                    <p className="text-[10px] text-brand-grey-1">
                      {layer.source} {layer.unit && `(${layer.unit})`} &middot; {valueCount}/{activeSet.sample_points.length} values
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file && csvLayerId) {
                        handleCSVUpload(file, csvLayerId)
                      }
                      e.target.value = ''
                    }}
                  />
                  <button
                    onClick={() => { setCsvLayerId(layer.id); fileInputRef.current?.click() }}
                    className="p-1 rounded text-brand-grey-1 hover:text-meta-blue hover:bg-blue-50"
                    title="Upload values from CSV"
                  >
                    <Upload size={12} />
                  </button>
                  <button
                    onClick={() => handleDeleteLayer(layer.id)}
                    disabled={deleting === layer.id}
                    className="p-1 rounded text-brand-grey-1 hover:text-red-500 hover:bg-red-50"
                  >
                    {deleting === layer.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Layer Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); setLayerName(''); setLayerUnit(''); setLayerSource('manual') }}
        title="Add Data Layer"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Layer Name</label>
            <input
              autoFocus
              value={layerName}
              onChange={e => setLayerName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateLayer() }}
              placeholder="e.g. pH, EC, Organic Carbon, NDVI"
              className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-meta-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Unit <span className="text-brand-grey-1 font-normal">(optional)</span></label>
            <input
              value={layerUnit}
              onChange={e => setLayerUnit(e.target.value)}
              placeholder="e.g. pH units, dS/m, %, index"
              className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-meta-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Data Source</label>
            <select
              value={layerSource}
              onChange={e => setLayerSource(e.target.value)}
              className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-meta-blue bg-white"
            >
              {SOURCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {(layerSource === 'ndvi' || layerSource === 'satellite') && (
              <p className="text-xs text-meta-blue mt-1">
                NDVI and satellite data source integrations are coming soon. You can create the layer now and import values manually or via CSV.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreateLayer} disabled={creating || !layerName.trim()}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add Layer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
