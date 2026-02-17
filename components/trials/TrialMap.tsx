'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, CircleMarker, LayersControl, FeatureGroup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { FeatureCollection } from 'geojson'
import { Upload, Trash2, Loader2, Layers, MapPin, MousePointer, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import SamplePointSetPanel from './SamplePointSetPanel'
import PointDataLayersPanel from './PointDataLayersPanel'
import { detectGISFileType, parseGISFile, GIS_ACCEPT } from '@/lib/parsers/gis'
import type { PointSet, SamplePoint as SetPoint } from './SamplePointSetPanel'

import 'leaflet/dist/leaflet.css'

// Fix Leaflet default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface GISLayer {
  id: string
  trial_id: string
  name: string
  file_type: string
  geojson: FeatureCollection
  feature_count: number
  style: { color: string; weight: number; fillOpacity: number } | null
  created_at: string
}

interface SoilSample {
  latitude: number | null
  longitude: number | null
  sample_no: string
  property: string | null
  block: string | null
}

interface TrialMapProps {
  trial: { id: string; gps: string | null; name: string }
  samples: SoilSample[]
  gisLayers: GISLayer[]
  pointSets: PointSet[]
  supabaseUrl: string
}

/** Parse the trial.gps text field (e.g. "-29.05, 151.29") into [lat, lng] */
function parseGPS(gps: string | null): [number, number] | null {
  if (!gps) return null
  const parts = gps.split(',').map((s) => parseFloat(s.trim()))
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return [parts[0], parts[1]]
  }
  return null
}

const LAYER_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
const SET_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

/** Auto-fit the map bounds to show all data */
function FitBounds({ points, geoJsonLayers }: { points: [number, number][]; geoJsonLayers: FeatureCollection[] }) {
  const map = useMap()

  useEffect(() => {
    const bounds = L.latLngBounds([])

    for (const [lat, lng] of points) {
      bounds.extend([lat, lng])
    }

    for (const fc of geoJsonLayers) {
      try {
        const layer = L.geoJSON(fc)
        const layerBounds = layer.getBounds()
        if (layerBounds.isValid()) {
          bounds.extend(layerBounds)
        }
      } catch {
        // skip invalid geojson
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 })
    }
  }, [map, points, geoJsonLayers])

  return null
}

/** Map click handler for drawing mode */
function DrawClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function TrialMap({ trial, samples, gisLayers: initialLayers, pointSets: initialPointSets, supabaseUrl }: TrialMapProps) {
  // GIS layer state
  const [gisLayers, setGisLayers] = useState(initialLayers)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const gisFileInputRef = useRef<HTMLInputElement>(null)

  // Sample point sets state
  const [pointSets, setPointSets] = useState<PointSet[]>(initialPointSets)
  const [activeSetId, setActiveSetId] = useState<string | null>(null)
  const [drawingMode, setDrawingMode] = useState(false)
  const [saving, setSaving] = useState(false)

  // CSV import state
  const [showCSVModal, setShowCSVModal] = useState(false)
  const [csvSetId, setCsvSetId] = useState<string | null>(null)
  const csvFileInputRef = useRef<HTMLInputElement>(null)

  // Side panel tab
  const [sideTab, setSideTab] = useState<'sets' | 'layers' | 'gis'>('sets')

  const trialCoord = parseGPS(trial.gps)

  const samplePoints = useMemo(
    () =>
      samples.filter(
        (s): s is SoilSample & { latitude: number; longitude: number } =>
          s.latitude != null && s.longitude != null
      ),
    [samples]
  )

  const activeSet = useMemo(
    () => pointSets.find(s => s.id === activeSetId) || null,
    [pointSets, activeSetId]
  )

  // Gather all points for auto-bounds
  const allPoints: [number, number][] = useMemo(() => {
    const pts: [number, number][] = []
    if (trialCoord) pts.push(trialCoord)
    for (const s of samplePoints) {
      pts.push([s.latitude, s.longitude])
    }
    for (const set of pointSets) {
      for (const p of set.sample_points) {
        pts.push([p.latitude, p.longitude])
      }
    }
    return pts
  }, [trialCoord, samplePoints, pointSets])

  const allGeoJsons = useMemo(
    () => gisLayers.map((l) => l.geojson),
    [gisLayers]
  )

  // Default center: trial GPS, first sample point, or Australia
  const defaultCenter: [number, number] = trialCoord
    ?? (samplePoints.length > 0 ? [samplePoints[0].latitude, samplePoints[0].longitude] : [-28.0, 134.0])

  const defaultZoom = trialCoord || samplePoints.length > 0 ? 14 : 4

  // --- GIS upload/delete handlers ---
  async function handleGISUpload(fileList: FileList) {
    const file = fileList[0]
    if (!file) return

    setUploadError(null)
    const fileType = detectGISFileType(file.name)
    if (!fileType) {
      setUploadError('Unsupported file type. Please upload .geojson, .kml, .kmz, .shp, or .zip files.')
      return
    }

    setUploading(true)
    try {
      const geojson = await parseGISFile(file, fileType)
      if (!geojson.features || geojson.features.length === 0) {
        throw new Error('No features found in the uploaded file.')
      }

      const formData = new FormData()
      formData.append('trial_id', trial.id)
      formData.append('name', file.name.replace(/\.[^.]+$/, ''))
      formData.append('file_type', fileType)
      formData.append('geojson', JSON.stringify(geojson))
      formData.append('file', file)

      const res = await fetch('/api/upload/gis', { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Upload failed (${res.status})`)
      }

      const { layer } = await res.json()
      setGisLayers((prev) => [...prev, layer])
    } catch (err: any) {
      console.error('GIS upload failed:', err)
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (gisFileInputRef.current) gisFileInputRef.current.value = ''
    }
  }

  async function handleGISDelete(layerId: string) {
    setDeleting(layerId)
    try {
      const res = await fetch(`/api/upload/gis/${layerId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setGisLayers((prev) => prev.filter((l) => l.id !== layerId))
    } catch (err) {
      console.error('GIS layer delete failed:', err)
    } finally {
      setDeleting(null)
    }
  }

  // --- Drawing mode handlers ---
  async function handleMapClick(lat: number, lng: number) {
    if (!drawingMode || !activeSetId) return

    const set = pointSets.find(s => s.id === activeSetId)
    if (!set) return

    // Find the highest existing SP-NNN number to avoid label collisions after deletions
    let maxNum = 0
    for (const p of set.sample_points) {
      const match = p.label.match(/^SP-(\d+)$/)
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10))
    }
    const nextNum = maxNum + 1
    const label = `SP-${String(nextNum).padStart(3, '0')}`

    setSaving(true)
    try {
      const res = await fetch(`/api/sample-point-sets/${activeSetId}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          latitude: lat,
          longitude: lng,
          sort_order: nextNum - 1,
        }),
      })

      if (!res.ok) throw new Error('Failed to add point')
      const { points } = await res.json()

      setPointSets(prev => prev.map(s => {
        if (s.id !== activeSetId) return s
        return { ...s, sample_points: [...s.sample_points, ...points] }
      }))
    } catch (err) {
      console.error('Add point failed:', err)
    } finally {
      setSaving(false)
    }
  }

  // --- CSV import handler ---
  async function handleCSVImport(file: File) {
    if (!csvSetId) return

    const text = await file.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) {
      alert('CSV must have a header row and at least one data row')
      return
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    const latCol = headers.findIndex(h => ['latitude', 'lat', 'y'].includes(h))
    const lngCol = headers.findIndex(h => ['longitude', 'lng', 'lon', 'long', 'x'].includes(h))
    const labelCol = headers.findIndex(h => ['label', 'name', 'point', 'sample', 'sample_no', 'id', 'site'].includes(h))
    const notesCol = headers.findIndex(h => ['notes', 'comment', 'description'].includes(h))

    if (latCol === -1 || lngCol === -1) {
      alert('CSV must have "latitude" and "longitude" columns')
      return
    }

    const points: any[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
      const lat = parseFloat(cols[latCol])
      const lng = parseFloat(cols[lngCol])
      if (isNaN(lat) || isNaN(lng)) continue

      points.push({
        label: labelCol !== -1 ? cols[labelCol] : `SP-${String(points.length + 1).padStart(3, '0')}`,
        latitude: lat,
        longitude: lng,
        notes: notesCol !== -1 ? cols[notesCol] || null : null,
        sort_order: points.length,
      })
    }

    if (points.length === 0) {
      alert('No valid GPS points found in CSV')
      return
    }

    try {
      const res = await fetch(`/api/sample-point-sets/${csvSetId}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      })

      if (!res.ok) throw new Error('Import failed')
      const { points: imported } = await res.json()

      setPointSets(prev => prev.map(s => {
        if (s.id !== csvSetId) return s
        return { ...s, sample_points: [...s.sample_points, ...imported], source: 'csv_import' }
      }))

      alert(`Imported ${imported.length} GPS points`)
    } catch (err) {
      console.error('CSV import failed:', err)
      alert('CSV import failed')
    } finally {
      setShowCSVModal(false)
      setCsvSetId(null)
    }
  }

  function handleSetUpdate(updatedSet: PointSet) {
    setPointSets(prev => prev.map(s => s.id === updatedSet.id ? updatedSet : s))
  }

  async function handleDeletePoint(setId: string, pointId: string) {
    try {
      const res = await fetch(`/api/sample-point-sets/${setId}/points/${pointId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Delete point failed')

      setPointSets(prev => prev.map(s => {
        if (s.id !== setId) return s
        return { ...s, sample_points: s.sample_points.filter(p => p.id !== pointId) }
      }))
    } catch (err) {
      console.error('Delete point failed:', err)
    }
  }

  return (
    <div className="flex gap-4">
      {/* Side panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        {/* Side panel tabs */}
        <div className="flex gap-1 border-b border-brand-grey-2">
          {[
            { key: 'sets' as const, label: 'Point Sets' },
            { key: 'layers' as const, label: 'Data Layers' },
            { key: 'gis' as const, label: 'GIS Layers' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setSideTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                sideTab === tab.key
                  ? 'border-brand-black text-brand-black'
                  : 'border-transparent text-brand-grey-1 hover:text-brand-black'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Point Sets panel */}
        {sideTab === 'sets' && (
          <SamplePointSetPanel
            trialId={trial.id}
            pointSets={pointSets}
            activeSetId={activeSetId}
            onSelectSet={setActiveSetId}
            onSetsChange={setPointSets}
            onStartDrawing={() => setDrawingMode(true)}
            onImportCSV={(setId) => { setCsvSetId(setId); setShowCSVModal(true) }}
            hasExistingSamples={samplePoints.length > 0}
          />
        )}

        {/* Data Layers panel */}
        {sideTab === 'layers' && (
          <PointDataLayersPanel
            activeSet={activeSet}
            onSetUpdate={handleSetUpdate}
          />
        )}

        {/* GIS Layers panel */}
        {sideTab === 'gis' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="signpost-label">GIS LAYERS</p>
              <div>
                <input
                  ref={gisFileInputRef}
                  type="file"
                  accept={GIS_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleGISUpload(e.target.files)
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => gisFileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <><Loader2 size={12} className="animate-spin" /> Processing...</>
                  ) : (
                    <><Upload size={12} /> Upload</>
                  )}
                </Button>
              </div>
            </div>

            {uploadError && (
              <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {uploadError}
              </div>
            )}

            {gisLayers.length === 0 ? (
              <div className="text-center py-4 text-brand-grey-1">
                <Layers size={24} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs">Upload Shapefile (.zip), KML, KMZ, or GeoJSON</p>
              </div>
            ) : (
              <div className="space-y-2">
                {gisLayers.map((layer, idx) => {
                  const color = layer.style?.color || LAYER_COLORS[idx % LAYER_COLORS.length]
                  return (
                    <div key={layer.id} className="flex items-center justify-between p-2 rounded-lg border border-brand-grey-2 bg-white">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <div>
                          <p className="text-xs font-medium">{layer.name}</p>
                          <p className="text-[10px] text-brand-grey-1">
                            {layer.file_type.toUpperCase()} &middot; {layer.feature_count} feature{layer.feature_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleGISDelete(layer.id)}
                        disabled={deleting === layer.id}
                        className="p-1 rounded text-brand-grey-1 hover:text-red-500 hover:bg-red-50"
                      >
                        {deleting === layer.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Map area */}
      <div className="flex-1 min-w-0">
        {/* Drawing mode banner */}
        {drawingMode && (
          <div className="mb-3 p-3 rounded-lg bg-meta-blue/10 border border-meta-blue/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MousePointer size={16} className="text-meta-blue" />
              <span className="text-sm font-medium text-meta-blue">
                Drawing mode — click on the map to place sample points
                {activeSet && <span className="font-normal"> into "{activeSet.name}"</span>}
              </span>
              {saving && <Loader2 size={14} className="animate-spin text-meta-blue" />}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setDrawingMode(false)}
            >
              <X size={12} />
              Done
            </Button>
          </div>
        )}

        {/* Map */}
        <div
          className="rounded-lg overflow-hidden border border-brand-grey-2"
          style={{ height: drawingMode ? '540px' : '560px', cursor: drawingMode ? 'crosshair' : undefined }}
        >
          <MapContainer
            center={defaultCenter}
            zoom={defaultZoom}
            className="h-full w-full"
            scrollWheelZoom={true}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Street">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer
                  attribution='&copy; Esri'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>

              {/* Trial location marker */}
              {trialCoord && (
                <LayersControl.Overlay checked name="Trial Location">
                  <Marker position={trialCoord}>
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold">{trial.name}</p>
                        <p className="text-gray-500 font-mono text-xs">{trial.gps}</p>
                      </div>
                    </Popup>
                  </Marker>
                </LayersControl.Overlay>
              )}

              {/* Existing soil sample points */}
              {samplePoints.length > 0 && (
                <LayersControl.Overlay checked name={`Soil Samples (${samplePoints.length})`}>
                  <FeatureGroup>
                    {samplePoints.map((s, i) => (
                      <CircleMarker
                        key={i}
                        center={[s.latitude, s.longitude]}
                        radius={6}
                        pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.7, weight: 2 }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <p className="font-semibold">Sample {s.sample_no}</p>
                            {s.property && <p className="text-gray-500">{s.property}</p>}
                            {s.block && <p className="text-gray-500">Block: {s.block}</p>}
                            <p className="font-mono text-xs">{s.latitude}, {s.longitude}</p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    ))}
                  </FeatureGroup>
                </LayersControl.Overlay>
              )}

              {/* Sample point sets */}
              {pointSets.map((set, setIdx) => {
                const color = set.style?.color || SET_COLORS[setIdx % SET_COLORS.length]
                const isActive = set.id === activeSetId
                return set.sample_points.length > 0 ? (
                  <LayersControl.Overlay checked key={set.id} name={`${set.name} (${set.sample_points.length})`}>
                    <FeatureGroup>
                      {set.sample_points.map((p) => (
                        <CircleMarker
                          key={p.id}
                          center={[p.latitude, p.longitude]}
                          radius={isActive ? 8 : (set.style?.radius || 7)}
                          pathOptions={{
                            color: isActive ? '#000' : color,
                            fillColor: color,
                            fillOpacity: 0.8,
                            weight: isActive ? 3 : 2,
                          }}
                        >
                          <Popup>
                            <div className="text-sm">
                              <p className="font-semibold">{p.label}</p>
                              <p className="text-gray-500 text-xs">{set.name}</p>
                              {p.notes && <p className="text-gray-500 text-xs">{p.notes}</p>}
                              <p className="font-mono text-xs">{Number(p.latitude).toFixed(6)}, {Number(p.longitude).toFixed(6)}</p>
                              <button
                                onClick={() => handleDeletePoint(set.id, p.id)}
                                className="mt-1 text-xs text-red-500 hover:text-red-700"
                              >
                                Delete point
                              </button>
                            </div>
                          </Popup>
                        </CircleMarker>
                      ))}
                    </FeatureGroup>
                  </LayersControl.Overlay>
                ) : null
              })}

              {/* GIS layers */}
              {gisLayers.map((layer, idx) => {
                const color = layer.style?.color || LAYER_COLORS[idx % LAYER_COLORS.length]
                return (
                  <LayersControl.Overlay checked key={layer.id} name={layer.name}>
                    <GeoJSON
                      data={layer.geojson}
                      style={() => ({
                        color,
                        weight: layer.style?.weight ?? 2,
                        fillOpacity: layer.style?.fillOpacity ?? 0.15,
                        fillColor: color,
                      })}
                      onEachFeature={(feature, leafletLayer) => {
                        const props = feature.properties
                        if (props && Object.keys(props).length > 0) {
                          const html = Object.entries(props)
                            .filter(([, v]) => v != null && v !== '')
                            .map(([k, v]) => `<b>${k}:</b> ${v}`)
                            .join('<br/>')
                          if (html) leafletLayer.bindPopup(`<div class="text-xs">${html}</div>`)
                        }
                      }}
                    />
                  </LayersControl.Overlay>
                )
              })}
            </LayersControl>

            <FitBounds points={allPoints} geoJsonLayers={allGeoJsons} />

            {/* Drawing click handler */}
            {drawingMode && activeSetId && (
              <DrawClickHandler onMapClick={handleMapClick} />
            )}
          </MapContainer>
        </div>

        {/* Empty state */}
        {!trialCoord && samplePoints.length === 0 && gisLayers.length === 0 && pointSets.length === 0 && (
          <div className="text-center py-6 text-brand-grey-1">
            <MapPin size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium mb-1">No spatial data yet</p>
            <p className="text-xs">
              Create a sample point set and draw points on the map, upload GIS files, or import GPS data from a CSV.
            </p>
          </div>
        )}
      </div>

      {/* CSV Import Modal */}
      <Modal
        open={showCSVModal}
        onClose={() => { setShowCSVModal(false); setCsvSetId(null) }}
        title="Import GPS Points from CSV"
      >
        <div className="space-y-4">
          <div className="text-sm text-brand-grey-1 space-y-2">
            <p>Upload a CSV file with GPS coordinates. Required columns:</p>
            <ul className="list-disc ml-4 text-xs space-y-1">
              <li><strong>latitude</strong> (or lat, y)</li>
              <li><strong>longitude</strong> (or lng, lon, long, x)</li>
            </ul>
            <p className="text-xs">Optional columns: <strong>label</strong> (or name, point, sample_no), <strong>notes</strong></p>
          </div>
          <div>
            <input
              ref={csvFileInputRef}
              type="file"
              accept=".csv"
              className="block w-full text-sm text-brand-grey-1 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-meta-blue file:text-white hover:file:bg-meta-true-blue file:cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleCSVImport(file)
              }}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => { setShowCSVModal(false); setCsvSetId(null) }}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
