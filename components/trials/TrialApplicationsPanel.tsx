'use client'

import { useState, useRef } from 'react'
import { Upload, Trash2, Loader2, Plus, Link2, Pencil } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ProductTag from '@/components/ui/ProductTag'
import { detectGISFileType, parseGISFile, sanitizeFeatures, compactGeoJSON, GIS_ACCEPT } from '@/lib/parsers/gis'
import { formatDate } from '@/lib/utils'
import type { FeatureCollection } from 'geojson'

interface Treatment {
  id: string
  trt_number: number
  application: string | null
  fertiliser: string | null
  product: string | null
  rate: string | null
  timing: string | null
}

export interface TrialApplication {
  id: string
  trial_id: string
  name: string
  trt_number: number | null
  application_type: string | null
  product: string | null
  rate: string | null
  date_applied: string | null
  geojson: FeatureCollection
  geojson_source: string | null
  feature_count: number
  style: { color: string; weight: number; fillOpacity: number } | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface TrialApplicationsPanelProps {
  trialId: string
  applications: TrialApplication[]
  treatments: Treatment[]
  onApplicationsChange: (apps: TrialApplication[]) => void
}

const APPLICATION_TYPES = [
  { value: 'fertiliser', label: 'Fertiliser' },
  { value: 'herbicide', label: 'Herbicide' },
  { value: 'fungicide', label: 'Fungicide' },
  { value: 'insecticide', label: 'Insecticide' },
  { value: 'seed', label: 'Seed' },
  { value: 'lime', label: 'Lime' },
  { value: 'gypsum', label: 'Gypsum' },
  { value: 'other', label: 'Other' },
]

// Distinct colours for application zones (orange-amber palette to differentiate from GIS layers)
const APP_COLORS = ['#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#ea580c', '#c2410c', '#9a3412']

export default function TrialApplicationsPanel({
  trialId,
  applications: initialApps,
  treatments,
  onApplicationsChange,
}: TrialApplicationsPanelProps) {
  const [applications, setApplications] = useState<TrialApplication[]>(initialApps)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingApp, setEditingApp] = useState<TrialApplication | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formTrt, setFormTrt] = useState<number | ''>('')
  const [formType, setFormType] = useState('')
  const [formProduct, setFormProduct] = useState('')
  const [formRate, setFormRate] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formGeojson, setFormGeojson] = useState<FeatureCollection | null>(null)
  const [formSource, setFormSource] = useState<string | null>(null)
  const [formFile, setFormFile] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  function resetForm() {
    setFormName('')
    setFormTrt('')
    setFormType('')
    setFormProduct('')
    setFormRate('')
    setFormDate('')
    setFormNotes('')
    setFormGeojson(null)
    setFormSource(null)
    setFormFile(null)
    setError(null)
  }

  function openAddModal() {
    resetForm()
    setEditingApp(null)
    setShowAddModal(true)
  }

  function openEditModal(app: TrialApplication) {
    setEditingApp(app)
    setFormName(app.name)
    setFormTrt(app.trt_number ?? '')
    setFormType(app.application_type || '')
    setFormProduct(app.product || '')
    setFormRate(app.rate || '')
    setFormDate(app.date_applied || '')
    setFormNotes(app.notes || '')
    setFormGeojson(app.geojson)
    setFormSource(app.geojson_source)
    setFormFile(null)
    setError(null)
    setShowAddModal(true)
  }

  function closeModal() {
    setShowAddModal(false)
    setEditingApp(null)
    resetForm()
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const fileType = detectGISFileType(file.name)
    if (!fileType) {
      setError('Unsupported file type. Use .geojson, .kml, .kmz, or .zip (shapefile).')
      return
    }

    setParsing(true)
    setError(null)
    try {
      const geojson = await parseGISFile(file, fileType)
      const sanitized = sanitizeFeatures(geojson)
      if (sanitized.features.length === 0) {
        setError('The file contains no valid geometries.')
        return
      }
      setFormGeojson(sanitized)
      setFormSource(fileType === 'shapefile' ? 'shapefile' : fileType)
      setFormFile(file.name)
      // Auto-fill name from file name if blank
      if (!formName) {
        setFormName(file.name.replace(/\.[^.]+$/, ''))
      }
    } catch (err: any) {
      setError(err.message || 'Failed to parse file.')
    } finally {
      setParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Auto-fill from treatment when trt_number is selected
  function handleTrtChange(value: string) {
    const num = value === '' ? '' : parseInt(value, 10)
    setFormTrt(num)
    if (num !== '') {
      const trt = treatments.find((t) => t.trt_number === num)
      if (trt) {
        if (!formProduct && trt.product) setFormProduct(trt.product)
        if (!formRate && trt.rate) setFormRate(trt.rate)
        if (!formType && trt.application) {
          // Try to match application text to a type
          const lower = trt.application.toLowerCase()
          const matched = APPLICATION_TYPES.find((t) => lower.includes(t.value))
          if (matched) setFormType(matched.value)
        }
      }
    }
  }

  async function handleSave() {
    if (!formName.trim()) {
      setError('Name is required.')
      return
    }
    if (!formGeojson) {
      setError('Upload a GIS file to define the application zone.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      // Compact shapefile GeoJSON to reduce payload size (truncate coordinate
      // precision, strip null bytes) so it stays under platform body-size limits.
      const compacted = compactGeoJSON(formGeojson)

      const payload = {
        name: formName.trim(),
        trt_number: formTrt === '' ? null : formTrt,
        application_type: formType || null,
        product: formProduct || null,
        rate: formRate || null,
        date_applied: formDate || null,
        geojson: compacted,
        geojson_source: formSource,
        notes: formNotes || null,
      }

      let res: Response
      if (editingApp) {
        res = await fetch(`/api/trials/${encodeURIComponent(trialId)}/applications/${editingApp.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/trials/${encodeURIComponent(trialId)}/applications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(
          data?.error ||
            (res.status === 413
              ? 'The application zone file is too large. Try simplifying the geometry or converting to GeoJSON.'
              : `Failed to save application (HTTP ${res.status}).`)
        )
      }

      const saved = await res.json()

      let updated: TrialApplication[]
      if (editingApp) {
        updated = applications.map((a) => (a.id === saved.id ? saved : a))
      } else {
        updated = [...applications, saved]
      }
      setApplications(updated)
      onApplicationsChange(updated)
      closeModal()
    } catch (err: any) {
      setError(err.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(appId: string) {
    if (!confirm('Delete this application zone?')) return
    setDeleting(appId)
    try {
      const res = await fetch(
        `/api/trials/${encodeURIComponent(trialId)}/applications/${appId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Delete failed')
      const updated = applications.filter((a) => a.id !== appId)
      setApplications(updated)
      onApplicationsChange(updated)
    } catch (err) {
      console.error('Application delete failed:', err)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="signpost-label">APPLICATION ZONES</p>
          <p className="text-xs text-brand-grey-1 mt-1">
            Define spatial application zones from KML, Shapefile, or GeoJSON files. Link to treatments to see them on the map.
          </p>
        </div>
        <Button size="sm" onClick={openAddModal}>
          <Plus size={14} />
          Add Application
        </Button>
      </div>

      {/* Applications list */}
      {applications.length === 0 ? (
        <p className="text-sm text-brand-grey-1 py-6 text-center">
          No application zones defined. Upload a GIS file or draw on the map to define where products were applied.
        </p>
      ) : (
        <div className="space-y-2">
          {applications.map((app, idx) => {
            const color = app.style?.color || APP_COLORS[idx % APP_COLORS.length]
            const linkedTrt = app.trt_number != null
              ? treatments.find((t) => t.trt_number === app.trt_number)
              : null
            return (
              <div
                key={app.id}
                className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{app.name}</p>
                      {app.application_type && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                          {app.application_type}
                        </span>
                      )}
                      {app.product && <ProductTag product={app.product} />}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-brand-grey-1 mt-0.5 flex-wrap">
                      {app.feature_count > 0 && (
                        <span>{app.feature_count} feature{app.feature_count !== 1 ? 's' : ''}</span>
                      )}
                      {app.geojson_source && (
                        <span>via {app.geojson_source}</span>
                      )}
                      {app.rate && (
                        <span className="font-mono">{app.rate}</span>
                      )}
                      {app.date_applied && (
                        <span>{formatDate(app.date_applied)}</span>
                      )}
                      {linkedTrt && (
                        <span className="flex items-center gap-1 text-meta-blue">
                          <Link2 size={10} />
                          Trt {linkedTrt.trt_number}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditModal(app)}
                    className="p-1.5 rounded-md text-brand-grey-1 hover:text-brand-black hover:bg-brand-grey-3 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(app.id)}
                    disabled={deleting === app.id}
                    className="p-1.5 rounded-md text-brand-grey-1 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    {deleting === app.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal
        open={showAddModal}
        onClose={closeModal}
        title={editingApp ? 'Edit Application' : 'Add Application Zone'}
        className="max-w-xl"
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-xs font-medium text-brand-grey-1 block mb-1">Name *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Block A - Digestor Application"
              className="w-full text-sm border border-brand-grey-2 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-black"
            />
          </div>

          {/* Treatment link */}
          <div>
            <label className="text-xs font-medium text-brand-grey-1 block mb-1">
              Link to Treatment
            </label>
            <select
              value={formTrt}
              onChange={(e) => handleTrtChange(e.target.value)}
              className="w-full text-sm border border-brand-grey-2 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-black"
            >
              <option value="">No treatment linked</option>
              {treatments.map((t) => (
                <option key={t.trt_number} value={t.trt_number}>
                  Trt {t.trt_number}{t.product ? ` — ${t.product}` : ''}{t.application ? ` (${t.application})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Type + Product row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-brand-grey-1 block mb-1">Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full text-sm border border-brand-grey-2 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-black"
              >
                <option value="">Select type...</option>
                {APPLICATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-brand-grey-1 block mb-1">Product</label>
              <input
                type="text"
                value={formProduct}
                onChange={(e) => setFormProduct(e.target.value)}
                placeholder="e.g. Digestor"
                className="w-full text-sm border border-brand-grey-2 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-black"
              />
            </div>
          </div>

          {/* Rate + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-brand-grey-1 block mb-1">Rate</label>
              <input
                type="text"
                value={formRate}
                onChange={(e) => setFormRate(e.target.value)}
                placeholder="e.g. 10 L/ha"
                className="w-full text-sm border border-brand-grey-2 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-black"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-brand-grey-1 block mb-1">Date Applied</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full text-sm border border-brand-grey-2 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-black"
              />
            </div>
          </div>

          {/* GIS file upload */}
          <div>
            <label className="text-xs font-medium text-brand-grey-1 block mb-1">
              Application Zone *
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={GIS_ACCEPT}
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
              >
                {parsing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    {formGeojson ? 'Replace File' : 'Upload GIS File'}
                  </>
                )}
              </Button>
              {formGeojson && (
                <span className="text-xs text-green-700">
                  {formFile ? formFile : `${formGeojson.features.length} feature${formGeojson.features.length !== 1 ? 's' : ''} loaded`}
                  {formFile && ` (${formGeojson.features.length} feature${formGeojson.features.length !== 1 ? 's' : ''})`}
                </span>
              )}
            </div>
            <p className="text-[11px] text-brand-grey-1 mt-1">
              Accepts .geojson, .kml, .kmz, or zipped Shapefile (.zip)
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-brand-grey-1 block mb-1">Notes</label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes about this application..."
              className="w-full text-sm border border-brand-grey-2 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-black resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-brand-grey-2">
            <Button size="sm" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving...
                </>
              ) : (
                editingApp ? 'Save Changes' : 'Add Application'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
