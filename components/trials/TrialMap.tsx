'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, CircleMarker, LayersControl, FeatureGroup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { FeatureCollection } from 'geojson'
import { Upload, Trash2, Loader2, Layers, MapPin } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { detectGISFileType, parseGISFile, GIS_ACCEPT } from '@/lib/parsers/gis'

const MAX_FILE_SIZE_MB = 50
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

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

interface SamplePoint {
  latitude: number | null
  longitude: number | null
  sample_no: string
  property: string | null
  block: string | null
}

interface TrialMapProps {
  trial: { id: string; gps: string | null; name: string }
  samples: SamplePoint[]
  gisLayers: GISLayer[]
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

export default function TrialMap({ trial, samples, gisLayers: initialLayers, supabaseUrl }: TrialMapProps) {
  const [gisLayers, setGisLayers] = useState(initialLayers)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const trialCoord = parseGPS(trial.gps)

  const samplePoints = useMemo(
    () =>
      samples.filter(
        (s): s is SamplePoint & { latitude: number; longitude: number } =>
          s.latitude != null && s.longitude != null
      ),
    [samples]
  )

  // Gather all points for auto-bounds
  const allPoints: [number, number][] = useMemo(() => {
    const pts: [number, number][] = []
    if (trialCoord) pts.push(trialCoord)
    for (const s of samplePoints) {
      pts.push([s.latitude, s.longitude])
    }
    return pts
  }, [trialCoord, samplePoints])

  const allGeoJsons = useMemo(
    () => gisLayers.map((l) => l.geojson),
    [gisLayers]
  )

  // Default center: trial GPS, first sample point, or Australia
  const defaultCenter: [number, number] = trialCoord
    ?? (samplePoints.length > 0 ? [samplePoints[0].latitude, samplePoints[0].longitude] : [-28.0, 134.0])

  const defaultZoom = trialCoord || samplePoints.length > 0 ? 14 : 4

  async function handleUpload(fileList: FileList) {
    const file = fileList[0]
    if (!file) return

    setUploadError(null)
    const fileType = detectGISFileType(file.name)
    if (!fileType) {
      setUploadError('Unsupported file type. Please upload .geojson, .kml, .kmz, .shp, or .zip files.')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.`)
      return
    }

    setUploading(true)
    const supabase = createClient()
    const layerId = crypto.randomUUID()
    const ext = file.name.split('.').pop()?.toLowerCase() || fileType
    const storagePath = `${trial.id}/${layerId}.${ext}`

    try {
      // Parse client-side
      const geojson = await parseGISFile(file, fileType)

      if (!geojson.features || geojson.features.length === 0) {
        throw new Error('No features found in the uploaded file.')
      }

      // Upload raw file directly to Supabase Storage (bypasses API route body limit)
      const { error: storageError } = await supabase.storage
        .from('trial-gis')
        .upload(storagePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })

      if (storageError) {
        throw new Error(`File storage failed: ${storageError.message}`)
      }

      // Send only metadata + GeoJSON to the API route (no raw file)
      const formData = new FormData()
      formData.append('trial_id', trial.id)
      formData.append('name', file.name.replace(/\.[^.]+$/, ''))
      formData.append('file_type', fileType)
      formData.append('geojson', JSON.stringify(geojson))
      formData.append('storage_path', storagePath)

      const res = await fetch('/api/upload/gis', { method: 'POST', body: formData })
      if (!res.ok) {
        // Clean up the uploaded file since the API call failed
        await supabase.storage.from('trial-gis').remove([storagePath])
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
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(layerId: string) {
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

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="signpost-label">
          TRIAL MAP
          {gisLayers.length > 0 && (
            <span className="ml-2 text-brand-grey-1 font-normal">
              ({gisLayers.length} layer{gisLayers.length !== 1 ? 's' : ''})
            </span>
          )}
        </p>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={GIS_ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleUpload(e.target.files)
              }
            }}
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload size={14} />
                Upload GIS File
              </>
            )}
          </Button>
        </div>
      </div>

      {uploadError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {uploadError}
        </div>
      )}

      {/* Map */}
      <div className="rounded-lg overflow-hidden border border-brand-grey-2" style={{ height: '500px' }}>
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

            {/* Sample points */}
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
        </MapContainer>
      </div>

      {/* Layer list */}
      {gisLayers.length > 0 && (
        <div className="mt-4">
          <p className="signpost-label mb-2">LAYERS</p>
          <div className="space-y-2">
            {gisLayers.map((layer, idx) => {
              const color = layer.style?.color || LAYER_COLORS[idx % LAYER_COLORS.length]
              return (
                <div
                  key={layer.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-brand-grey-2 bg-white"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div>
                      <p className="text-sm font-medium">{layer.name}</p>
                      <p className="text-xs text-brand-grey-1">
                        {layer.file_type.toUpperCase()} &middot; {layer.feature_count} feature{layer.feature_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(layer.id)}
                    disabled={deleting === layer.id}
                    className="p-1.5 rounded-md text-brand-grey-1 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    {deleting === layer.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!trialCoord && samplePoints.length === 0 && gisLayers.length === 0 && (
        <div className="text-center py-8 text-brand-grey-1">
          <MapPin size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium mb-1">No spatial data yet</p>
          <p className="text-xs">
            Upload a Shapefile (.zip), KML, KMZ, or GeoJSON file to see it on the map.
            <br />
            GPS coordinates from the trial summary and soil samples will also appear here.
          </p>
        </div>
      )}
    </div>
  )
}
