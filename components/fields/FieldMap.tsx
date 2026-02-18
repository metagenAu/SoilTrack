'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import { Upload, Pencil, Trash2, Save } from 'lucide-react'
import Button from '@/components/ui/Button'
import { parseGISFile, detectGISFileType, GIS_ACCEPT } from '@/lib/parsers/gis'
import type { FeatureCollection, Feature, Geometry } from 'geojson'

// Fix default marker icon URLs (Webpack bundler issue)
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
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
}

export default function FieldMap({
  fieldId,
  boundary,
  boundarySource,
  annotations,
  gisLayers,
  samplingPlans,
}: FieldMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const boundaryLayerRef = useRef<L.FeatureGroup>(new L.FeatureGroup())
  const drawControlRef = useRef<L.Control.Draw | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isDrawing, setIsDrawing] = useState(false)
  const [hasBoundary, setHasBoundary] = useState(!!boundary?.features?.length)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

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
            layer.bindTooltip(ann.label, { permanent: true, direction: 'center', className: 'field-annotation-label' })
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
              const html = entries.map(([k, v]) => `<b>${k}:</b> ${v}`).join('<br/>')
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
          .bindTooltip(pt.label, { permanent: false, direction: 'top' })
          .addTo(map)
      }
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

  // Enable drawing mode
  function startDrawing() {
    const map = mapRef.current
    if (!map) return

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
  }

  // Save boundary to DB
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
          boundary_source: 'drawn',
          area_ha,
        }),
      })

      if (!res.ok) throw new Error('Failed to save boundary')

      stopDrawing()
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
        (f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
      )

      if (polygonFeatures.length === 0) {
        throw new Error('No polygon features found in file. Boundary requires polygon geometry.')
      }

      const fc: FeatureCollection = {
        type: 'FeatureCollection',
        features: polygonFeatures,
      }

      // Render on map
      boundaryLayerRef.current.clearLayers()
      const geoLayer = L.geoJSON(fc, {
        style: { color: '#22c55e', weight: 3, fillOpacity: 0.1, fillColor: '#22c55e' },
      })
      geoLayer.eachLayer((l) => boundaryLayerRef.current.addLayer(l))
      setHasBoundary(true)

      if (mapRef.current) {
        mapRef.current.fitBounds(boundaryLayerRef.current.getBounds().pad(0.1))
      }

      // Calculate area
      let area_ha: number | null = null
      boundaryLayerRef.current.eachLayer((layer) => {
        const a = calcArea(layer)
        if (a) area_ha = (area_ha || 0) + a
      })

      // Save to DB
      const res = await fetch(`/api/fields/${fieldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boundary: fc,
          boundary_source: fileType,
          area_ha,
        }),
      })

      if (!res.ok) throw new Error('Failed to save imported boundary')

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

      boundaryLayerRef.current.clearLayers()
      setHasBoundary(false)
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
      <div className="flex items-center gap-2 mb-3">
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
          </>
        )}

        {statusMsg && (
          <span className={`text-xs ml-2 ${statusMsg.includes('Error') || statusMsg.includes('failed') ? 'text-red-600' : 'text-green-600'}`}>
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
    </div>
  )
}
