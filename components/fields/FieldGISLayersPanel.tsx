'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Trash2, Pencil, Check, X, Layers } from 'lucide-react'
import Button from '@/components/ui/Button'
import { parseGISFileMultiLayer, detectGISFileType, GIS_ACCEPT } from '@/lib/parsers/gis'
import type { FeatureCollection } from 'geojson'

interface FieldGISLayersPanelProps {
  fieldId: string
  gisLayers: Array<{
    id: string
    name: string
    file_type: string
    geojson: FeatureCollection
    feature_count: number
    style: Record<string, unknown> | null
    created_at: string
  }>
}

export default function FieldGISLayersPanel({
  fieldId,
  gisLayers,
}: FieldGISLayersPanelProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setStatusMsg(null)

    try {
      const fileType = detectGISFileType(file.name)
      if (!fileType) throw new Error('Unsupported file type')

      const layers = await parseGISFileMultiLayer(file, fileType)

      let imported = 0
      for (const layer of layers) {
        const res = await fetch(`/api/fields/${fieldId}/gis-layers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: layer.name,
            file_type: fileType,
            geojson: layer.geojson,
          }),
        })
        if (res.ok) imported++
      }

      setStatusMsg(`Imported ${imported} layer(s) from ${file.name}`)
      setTimeout(() => setStatusMsg(null), 5000)
      router.refresh()
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deleteLayer(layerId: string) {
    if (!confirm('Delete this GIS layer?')) return

    try {
      const res = await fetch(`/api/fields/${fieldId}/gis-layers/${layerId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      router.refresh()
    } catch {
      // silent
    }
  }

  async function renameLayer(layerId: string) {
    if (!editName.trim()) return

    try {
      const res = await fetch(`/api/fields/${fieldId}/gis-layers/${layerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (!res.ok) throw new Error('Failed to rename')
      setEditingId(null)
      router.refresh()
    } catch {
      // silent
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-brand-black">
          GIS Layers ({gisLayers.length})
        </h3>
        <div className="flex items-center gap-2">
          {statusMsg && (
            <span className={`text-xs ${statusMsg.includes('failed') ? 'text-red-600' : 'text-green-600'}`}>
              {statusMsg}
            </span>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={13} />
            {uploading ? 'Uploading...' : 'Upload Layer'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={GIS_ACCEPT}
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>

      {gisLayers.length === 0 ? (
        <p className="text-sm text-brand-grey-1 text-center py-4">
          No GIS layers uploaded. Upload shapefiles, KML, or GeoJSON files to overlay on the field map.
        </p>
      ) : (
        <div className="space-y-2">
          {gisLayers.map((layer) => (
            <div
              key={layer.id}
              className="flex items-center justify-between p-3 rounded-lg border border-brand-grey-2"
            >
              <div className="flex items-center gap-3">
                <Layers size={15} className="text-brand-grey-1" />
                {editingId === layer.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameLayer(layer.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="border border-brand-grey-2 rounded px-2 py-1 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
                      autoFocus
                    />
                    <button onClick={() => renameLayer(layer.id)} className="text-green-600 hover:text-green-700">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-brand-grey-1 hover:text-brand-black">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <span className="text-sm font-medium text-brand-black">{layer.name}</span>
                    <span className="text-xs text-brand-grey-1 ml-2">
                      {layer.feature_count} features &middot; {layer.file_type}
                    </span>
                  </div>
                )}
              </div>
              {editingId !== layer.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingId(layer.id)
                      setEditName(layer.name)
                    }}
                    className="text-brand-grey-1 hover:text-brand-black transition-colors p-1"
                    title="Rename layer"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteLayer(layer.id)}
                    className="text-brand-grey-1 hover:text-red-500 transition-colors p-1"
                    title="Delete layer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
