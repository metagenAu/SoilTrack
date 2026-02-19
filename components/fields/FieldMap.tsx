'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import { Upload, Pencil, Trash2, Save } from 'lucide-react'
import Button from '@/components/ui/Button'
import { parseGISFile, detectGISFileType, GIS_ACCEPT } from '@/lib/parsers/gis'
import type { FeatureCollection, Feature } from 'geojson'

// Fix default marker icon URLs (Webpack bundler issue) — self-hosted for reliability
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

// Escape HTML to prevent XSS via Leaflet tooltips (which use innerHTML)
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Custom icon for draggable vertex markers
const vertexIcon = L.divIcon({
  className: 'field-vertex-marker',
  html: '<div style="width:12px;height:12px;background:#22c55e;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:grab;"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

interface FieldMapProps {
  fieldId: string
  boundary: FeatureCollection | null
  boundarySource: string | null
  annotations: Array<{
    id: string
    label: string
    annotation_type: string
    geojson: Record<string, unknown>
    style: Record<string, unknown> | null
  }>
  gisLayers: Array<{
    id: string
    name: string
    geojson: FeatureCollection
    style: Record<string, unknown> | null
  }>
  samplingPlans: Array<{
    id: string
    name: string
    points: Array<{ lat: number; lng: number; label: string }>
  }>
  trialSamples?: Array<{
    sample_no: string
    latitude: number
    longitude: number
    property: string | null
    block: string | null
    trial_id: string
  }>
  trialGisLayers?: Array<{
    id: string
    trial_id: string
    name: string
    file_type: string
    geojson: FeatureCollection
    feature_count: number
    style: Record<string, unknown> | null
  }>
  fieldTrials?: Array<{
    trial_id: string
    trials: {
      id: string
      name: string
      crop: string | null
      status: string
    }
  }>
}

export default function FieldMap({
  fieldId,
  boundary,
  boundarySource,
  annotations,
  gisLayers,
  samplingPlans,
  trialSamples = [],
  trialGisLayers = [],
  fieldTrials = [],
}: FieldMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const boundaryLayerRef = useRef<L.FeatureGroup>(new L.FeatureGroup())
  const vertexMarkersRef = useRef<L.FeatureGroup>(new L.FeatureGroup())
  const drawControlRef = useRef<L.Control.Draw | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isDrawing, setIsDrawing] = useState(false)
  const [hasBoundary, setHasBoundary] = useState(!!boundary?.features?.length)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [boundaryModified, setBoundaryModified] = useState(false)

  // Calculate area from boundary GeoJSON (approximate using Leaflet)
  const calcArea = useCallback((layer: L.Layer): number | null => {
    if (layer instanceof L.Polygon) {
      const latlngs = layer.getLatLngs()[0] as L.LatLng[]
      if (latlngs.length < 3) return null
      // Use geodesic area if available (leaflet-draw adds this)
      const LRef = L as any
      if (LRef.GeometryUtil?.geodesicArea) {
        const area = LRef.GeometryUtil.geodesicArea(latlngs)
        if (area) return Math.round(area / 10000 * 100) / 100 // m² to ha
      }
    }
    return null
  }, [])

  // Add draggable vertex markers for all boundary polygons
  const addVertexMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // Clear existing vertex markers
    vertexMarkersRef.current.clearLayers()

    const polygonLayers: L.Polygon[] = []
    boundaryLayerRef.current.eachLayer((layer) => {
      if (layer instanceof L.Polygon) {
        polygonLayers.push(layer)
      }
    })

    for (const polygon of polygonLayers) {
      // getLatLngs() returns LatLng[][] for polygons (outer ring + optional holes)
      const rings = polygon.getLatLngs() as L.LatLng[][]

      for (let ringIdx = 0; ringIdx < rings.length; ringIdx++) {
        const ring = rings[ringIdx]
        for (let vertIdx = 0; vertIdx < ring.length; vertIdx++) {
          const latlng = ring[vertIdx]

          const marker = L.marker(latlng, {
            icon: vertexIcon,
            draggable: true,
            title: `Point ${vertIdx + 1}`,
          })

          // Store references for the drag handler
          ;(marker as any)._vtx = { polygon, ringIdx, vertIdx }

          marker.on('drag', (e: L.LeafletEvent) => {
            const m = e.target as L.Marker
            const vtx = (m as any)._vtx as { polygon: L.Polygon; ringIdx: number; vertIdx: number }
            const newLatLng = m.getLatLng()

            // Update the polygon vertex
            const currentRings = vtx.polygon.getLatLngs() as L.LatLng[][]
            currentRings[vtx.ringIdx][vtx.vertIdx] = newLatLng
            vtx.polygon.setLatLngs(currentRings)
          })

          marker.on('dragend', () => {
            setBoundaryModified(true)
          })

          marker.bindTooltip(`Point ${vertIdx + 1}`, { permanent: false, direction: 'top', offset: [0, -8] })

          vertexMarkersRef.current.addLayer(marker)
        }
      }
    }

    vertexMarkersRef.current.addTo(map)
  }, [])

  // Remove vertex markers from map
  const removeVertexMarkers = useCallback(() => {
    vertexMarkersRef.current.clearLayers()
    if (mapRef.current && mapRef.current.hasLayer(vertexMarkersRef.current)) {
      mapRef.current.removeLayer(vertexMarkersRef.current)
    }
  }, [])

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      preferCanvas: true,
      center: [-33.86, 151.21], // Default: Sydney
      zoom: 5,
    })

    // Base layers
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    })
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri' }
    )
    satellite.addTo(map)

    L.control.layers(
      { 'Street Map': osm, 'Satellite': satellite },
      {},
      { position: 'topright' }
    ).addTo(map)

    // Add boundary feature group
    boundaryLayerRef.current.addTo(map)

    // Render existing boundary
    if (boundary?.features?.length) {
      const geoLayer = L.geoJSON(boundary, {
        style: { color: '#22c55e', weight: 3, fillOpacity: 0.1, fillColor: '#22c55e' },
      })
      geoLayer.eachLayer((l) => boundaryLayerRef.current.addLayer(l))
    }

    // Render annotations
    for (const ann of annotations) {
      const annLayer = L.geoJSON(ann.geojson as any, {
        style: ann.style as L.PathOptions || { color: '#ef4444', weight: 2, fillOpacity: 0.2 },
        onEachFeature: (_feature, layer) => {
          if (ann.label) {
            layer.bindTooltip(escapeHtml(ann.label), { permanent: true, direction: 'center', className: 'field-annotation-label' })
          }
        },
      })
      annLayer.addTo(map)
    }

    // Render GIS layers
    for (const gisLayer of gisLayers) {
      const style = (gisLayer.style as L.PathOptions) || { color: '#3b82f6', weight: 2, fillOpacity: 0.15 }
      const gLayer = L.geoJSON(gisLayer.geojson, {
        style,
        onEachFeature: (feature, layer) => {
          if (feature.properties) {
            const entries = Object.entries(feature.properties).filter(([, v]) => v != null)
            if (entries.length > 0) {
              const html = entries.map(([k, v]) => `<b>${escapeHtml(String(k))}:</b> ${escapeHtml(String(v))}`).join('<br/>')
              layer.bindPopup(html)
            }
          }
        },
      })
      gLayer.addTo(map)
    }

    // Render sampling plan points
    for (const plan of samplingPlans) {
      for (const pt of plan.points) {
        L.circleMarker([pt.lat, pt.lng], {
          radius: 6,
          color: '#8b5cf6',
          fillColor: '#8b5cf6',
          fillOpacity: 0.8,
          weight: 2,
        })
          .bindTooltip(escapeHtml(pt.label), { permanent: false, direction: 'top' })
          .addTo(map)
      }
    }

    // Build a trial name lookup for popups
    const trialNameMap = new Map<string, string>()
    for (const ft of fieldTrials) {
      if (ft.trials) {
        trialNameMap.set(ft.trial_id, ft.trials.name)
      }
    }

    // Render linked trial sample points
    const TRIAL_SAMPLE_COLORS = ['#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']
    const trialIds = [...new Set(trialSamples.map(s => s.trial_id))]

    for (const s of trialSamples) {
      const trialIdx = trialIds.indexOf(s.trial_id)
      const color = TRIAL_SAMPLE_COLORS[trialIdx % TRIAL_SAMPLE_COLORS.length]
      const trialName = trialNameMap.get(s.trial_id) || s.trial_id

      L.circleMarker([s.latitude, s.longitude], {
        radius: 5,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 1,
      })
        .bindPopup(
          `<div class="text-sm">` +
          `<p class="font-semibold">Sample ${escapeHtml(s.sample_no)}</p>` +
          `<p class="text-gray-500">${escapeHtml(trialName)}</p>` +
          (s.property ? `<p class="text-gray-500">${escapeHtml(s.property)}</p>` : '') +
          (s.block ? `<p class="text-gray-500">Block: ${escapeHtml(s.block)}</p>` : '') +
          `<p class="font-mono text-xs">${s.latitude}, ${s.longitude}</p>` +
          `</div>`
        )
        .addTo(map)
    }

    // Render linked trial GIS layers
    const TRIAL_GIS_COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']
    for (let i = 0; i < trialGisLayers.length; i++) {
      const tLayer = trialGisLayers[i]
      if (!tLayer.geojson?.features?.length) continue
      const color = (tLayer.style as any)?.color || TRIAL_GIS_COLORS[i % TRIAL_GIS_COLORS.length]
      const gLayer = L.geoJSON(tLayer.geojson, {
        style: {
          color,
          weight: (tLayer.style as any)?.weight ?? 2,
          fillOpacity: (tLayer.style as any)?.fillOpacity ?? 0.15,
          fillColor: color,
          dashArray: '5, 3',
        },
        onEachFeature: (feature, layer) => {
          if (feature.properties) {
            const entries = Object.entries(feature.properties).filter(([, v]) => v != null)
            if (entries.length > 0) {
              const html = entries.map(([k, v]) => `<b>${escapeHtml(String(k))}:</b> ${escapeHtml(String(v))}`).join('<br/>')
              layer.bindPopup(html)
            }
          }
        },
      })
      gLayer.addTo(map)
    }

    // Fit bounds
    const allLayers = new L.FeatureGroup()
    boundaryLayerRef.current.eachLayer((l) => allLayers.addLayer(l))
    for (const gisLayer of gisLayers) {
      L.geoJSON(gisLayer.geojson).eachLayer((l) => allLayers.addLayer(l))
    }
    for (const plan of samplingPlans) {
      for (const pt of plan.points) {
        L.marker([pt.lat, pt.lng]).addTo(allLayers)
      }
    }
    for (const s of trialSamples) {
      L.marker([s.latitude, s.longitude]).addTo(allLayers)
    }
    for (const tLayer of trialGisLayers) {
      if (tLayer.geojson?.features?.length) {
        L.geoJSON(tLayer.geojson).eachLayer((l) => allLayers.addLayer(l))
      }
    }

    if (allLayers.getLayers().length > 0) {
      map.fitBounds(allLayers.getBounds().pad(0.1))
    }

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Add vertex markers after map initializes (and when boundary exists)
  useEffect(() => {
    if (!mapRef.current) return
    if (hasBoundary && !isDrawing) {
      // Small delay to ensure boundary layers are rendered
      const timer = setTimeout(() => addVertexMarkers(), 100)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBoundary, isDrawing])

  // Enable drawing mode
  function startDrawing() {
    const map = mapRef.current
    if (!map) return

    // Remove vertex markers during draw mode
    removeVertexMarkers()
    setBoundaryModified(false)

    // Clear existing boundary for redraw
    boundaryLayerRef.current.clearLayers()

    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: {
          shapeOptions: { color: '#22c55e', weight: 3, fillOpacity: 0.1 },
          allowIntersection: false,
          showArea: true,
        },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: boundaryLayerRef.current,
        remove: true,
      },
    })

    map.addControl(drawControl)
    drawControlRef.current = drawControl
    setIsDrawing(true)

    map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer
      boundaryLayerRef.current.addLayer(layer)
      setHasBoundary(true)
    })

    map.on(L.Draw.Event.DELETED, () => {
      if (boundaryLayerRef.current.getLayers().length === 0) {
        setHasBoundary(false)
      }
    })
  }

  function stopDrawing() {
    const map = mapRef.current
    if (!map || !drawControlRef.current) return
    map.removeControl(drawControlRef.current)
    drawControlRef.current = null
    map.off(L.Draw.Event.CREATED)
    map.off(L.Draw.Event.DELETED)
    setIsDrawing(false)

    // Restore vertex markers if boundary exists
    if (boundaryLayerRef.current.getLayers().length > 0) {
      addVertexMarkers()
    }
  }

  // Save boundary to DB (used for both draw mode and drag edits)
  async function saveBoundary() {
    const layers = boundaryLayerRef.current.getLayers()
    if (layers.length === 0) return

    setSaving(true)
    setStatusMsg(null)

    const features: Feature[] = layers.map((layer) => {
      const geojson = (layer as any).toGeoJSON() as Feature
      return geojson
    })

    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features,
    }

    // Calculate area
    let area_ha: number | null = null
    for (const layer of layers) {
      const a = calcArea(layer)
      if (a) area_ha = (area_ha || 0) + a
    }

    try {
      const res = await fetch(`/api/fields/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundary: fc,
          boundary_source: boundarySource || 'drawn',
          area_ha,
        }),
      })

      if (!res.ok) throw new Error('Failed to save boundary')

      if (isDrawing) {
        stopDrawing()
      }
      setBoundaryModified(false)
      setStatusMsg('Boundary saved')
      setTimeout(() => setStatusMsg(null), 3000)
    } catch {
      setStatusMsg('Error saving boundary')
    } finally {
      setSaving(false)
    }
  }

  // Import boundary from file
  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setStatusMsg(null)

    try {
      const fileType = detectGISFileType(file.name)
      if (!fileType) throw new Error('Unsupported file type')

      const geojson = await parseGISFile(file, fileType)

      // Extract only polygon features for boundary
      const polygonFeatures = geojson.features.filter(
        (f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
      )

      if (polygonFeatures.length === 0) {
        throw new Error('No polygon features found in file. Boundary requires polygon geometry.')
      }

      // Strip feature properties — boundaries only need geometry, and
      // shapefile attributes can bloat the payload beyond API body limits.
      const fc: FeatureCollection = {
        type: 'FeatureCollection',
        features: polygonFeatures.map((f) => ({
          type: 'Feature' as const,
          geometry: f.geometry,
          properties: {},
        })),
      }

      // Render on a temp layer to calculate area before saving
      const tempGroup = new L.FeatureGroup()
      const geoLayer = L.geoJSON(fc, {
        style: { color: '#22c55e', weight: 3, fillOpacity: 0.1, fillColor: '#22c55e' },
      })
      geoLayer.eachLayer((l) => tempGroup.addLayer(l))

      let area_ha: number | null = null
      tempGroup.eachLayer((layer) => {
        const a = calcArea(layer)
        if (a) area_ha = (area_ha || 0) + a
      })

      // Save to DB first — only render on map after persistence succeeds
      const res = await fetch(`/api/fields/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundary: fc,
          boundary_source: fileType,
          area_ha,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Failed to save boundary — the file may be too large')
      }

      // Save succeeded — now render on map
      removeVertexMarkers()
      boundaryLayerRef.current.clearLayers()
      tempGroup.eachLayer((l) => boundaryLayerRef.current.addLayer(l))
      setHasBoundary(true)
      setBoundaryModified(false)

      if (mapRef.current) {
        mapRef.current.fitBounds(boundaryLayerRef.current.getBounds().pad(0.1))
      }

      // Re-add vertex markers for the new boundary
      addVertexMarkers()

      setStatusMsg(`Imported ${polygonFeatures.length} polygon(s) from ${file.name}`)
      setTimeout(() => setStatusMsg(null), 5000)
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Clear boundary
  async function clearBoundary() {
    if (!confirm('Remove the field boundary?')) return

    setSaving(true)
    try {
      const res = await fetch(`/api/fields/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundary: null, boundary_source: null, area_ha: null }),
      })
      if (!res.ok) throw new Error('Failed to clear boundary')

      removeVertexMarkers()
      boundaryLayerRef.current.clearLayers()
      setHasBoundary(false)
      setBoundaryModified(false)
      stopDrawing()
      setStatusMsg('Boundary removed')
      setTimeout(() => setStatusMsg(null), 3000)
    } catch {
      setStatusMsg('Error clearing boundary')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-medium text-brand-grey-1 mr-2">Boundary:</span>

        {isDrawing ? (
          <>
            <Button size="sm" onClick={saveBoundary} disabled={saving || !hasBoundary}>
              <Save size={13} />
              {saving ? 'Saving...' : 'Save Boundary'}
            </Button>
            <Button size="sm" variant="secondary" onClick={stopDrawing}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" onClick={startDrawing}>
              <Pencil size={13} />
              {hasBoundary ? 'Redraw' : 'Draw'}
            </Button>
            <label className="cursor-pointer">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                <Upload size={13} />
                {importing ? 'Importing...' : 'Import File'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={GIS_ACCEPT}
                onChange={handleFileImport}
                className="hidden"
              />
            </label>
            {hasBoundary && (
              <Button size="sm" variant="ghost" onClick={clearBoundary} disabled={saving}>
                <Trash2 size={13} />
                Clear
              </Button>
            )}
            {boundaryModified && (
              <Button size="sm" onClick={saveBoundary} disabled={saving}>
                <Save size={13} />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </>
        )}

        {statusMsg && (
          <span className={`text-xs ml-2 ${statusMsg.toLowerCase().includes('error') || statusMsg.toLowerCase().includes('fail') ? 'text-red-600' : 'text-green-600'}`}>
            {statusMsg}
          </span>
        )}
      </div>

      {/* Map */}
      <div
        ref={mapContainerRef}
        className="h-[500px] rounded-lg border border-brand-grey-2 z-0"
      />

      {isDrawing && (
        <p className="text-xs text-brand-grey-1 mt-2">
          Click on the map to place vertices. Click the first vertex to close the polygon.
          Use the toolbar controls in the top-left to draw, edit, or delete shapes.
        </p>
      )}
      {hasBoundary && !isDrawing && (
        <p className="text-xs text-brand-grey-1 mt-2">
          Drag the green points to adjust the boundary. Click &ldquo;Save Changes&rdquo; to persist your edits.
        </p>
      )}

      {/* Linked trial data legend */}
      {(trialSamples.length > 0 || trialGisLayers.length > 0) && (
        <div className="mt-3 p-3 rounded-lg border border-brand-grey-2 bg-brand-grey-3/50">
          <p className="text-xs font-semibold text-brand-black mb-2">LINKED TRIAL DATA</p>
          <div className="space-y-1.5">
            {(() => {
              const TRIAL_SAMPLE_COLORS = ['#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']
              const trialIds = [...new Set(trialSamples.map(s => s.trial_id))]
              const trialNameMap = new Map<string, string>()
              for (const ft of fieldTrials) {
                if (ft.trials) {
                  trialNameMap.set(ft.trial_id, ft.trials.name)
                }
              }
              return trialIds.map((tid, idx) => {
                const count = trialSamples.filter(s => s.trial_id === tid).length
                const color = TRIAL_SAMPLE_COLORS[idx % TRIAL_SAMPLE_COLORS.length]
                const name = trialNameMap.get(tid) || tid
                return (
                  <div key={tid} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-brand-black font-medium">{name}</span>
                    <span className="text-brand-grey-1">{count} sample{count !== 1 ? 's' : ''}</span>
                    <a href={`/trials/${encodeURIComponent(tid)}`} className="text-meta-blue hover:underline ml-auto">
                      View trial
                    </a>
                  </div>
                )
              })
            })()}
            {trialGisLayers.map((tLayer, idx) => {
              const TRIAL_GIS_COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']
              const color = (tLayer.style as any)?.color || TRIAL_GIS_COLORS[idx % TRIAL_GIS_COLORS.length]
              return (
                <div key={tLayer.id} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-brand-black font-medium">{tLayer.name}</span>
                  <span className="text-brand-grey-1">
                    {tLayer.file_type.toUpperCase()} &middot; {tLayer.feature_count} feature{tLayer.feature_count !== 1 ? 's' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
