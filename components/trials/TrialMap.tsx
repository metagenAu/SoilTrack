'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, CircleMarker, LayersControl, FeatureGroup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { FeatureCollection } from 'geojson'
import { Upload, Trash2, Loader2, MapPin, Activity, FileSpreadsheet, Grid3X3, Flame, CircleDot } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { detectGISFileType, parseGISFileMultiLayer, sanitizeFeatures, GIS_ACCEPT } from '@/lib/parsers/gis'

// Escape HTML to prevent XSS via Leaflet popups/tooltips (which use innerHTML)
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const MAX_FILE_SIZE_MB = 50
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024


import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'

// Fix Leaflet default marker icon issue with bundlers — self-hosted for reliability
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

// ---------- Types ----------

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
  raw_data?: Record<string, any> | null
}

interface SoilChemistryRow {
  sample_no: string
  metric: string
  value: number | null
  unit: string | null
}

interface CustomMapLayer {
  id: string
  trial_id: string
  name: string
  metric_columns: string[]
  points: { sample_no?: string; lat: number; lng: number; values: Record<string, number> }[]
  point_count: number
  created_at: string
}

interface LinkedField {
  id: string
  field_id: string
  season: string | null
  fields: {
    id: string
    name: string
    farm: string | null
    region: string | null
    area_ha: number | null
    boundary: FeatureCollection | null
  }
}

interface FieldGISLayer {
  id: string
  field_id: string
  name: string
  file_type: string
  geojson: FeatureCollection
  feature_count: number
  style: { color: string; weight: number; fillOpacity: number } | null
}

interface TrialApplicationLayer {
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
}

interface TrialMapProps {
  trial: { id: string; gps: string | null; name: string }
  samples: SamplePoint[]
  gisLayers: GISLayer[]
  customLayers?: CustomMapLayer[]
  soilChemistry?: SoilChemistryRow[]
  linkedFields?: LinkedField[]
  fieldGisLayers?: FieldGISLayer[]
  applications?: TrialApplicationLayer[]
  supabaseUrl: string
}

// ---------- Helpers ----------

function parseGPS(gps: string | null): [number, number] | null {
  if (!gps) return null
  const parts = gps.split(',').map((s) => parseFloat(s.trim()))
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return [parts[0], parts[1]]
  }
  return null
}

const LAYER_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

// ---------- CSV Parser ----------

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

// ---------- Metric discovery ----------

const METRIC_EXCLUDE = new Set([
  'trial_id', 'sample_no', 'sampleno', 'sample no', 'sample', 'sample id', 'sampleid',
  'date', 'sample_date', 'collection_date', 'sampling_date',
  'property', 'farm', 'site',
  'block', 'paddock', 'zone',
  'barcode', 'bar_code', 'bar code', 'sample barcode', 'sample_barcode',
  'latitude', 'lat', 'longitude', 'lng', 'lon', 'long',
  'id', 'created_at', 'raw_data',
])

interface DiscoveredMetric {
  key: string
  label: string
  source: 'raw_data' | 'chemistry' | 'custom' | 'gis'
  layerId?: string
  unit?: string
}

/**
 * Scan GIS layer features (sample up to 100) to discover numeric attribute
 * columns.  Only columns where >= 50 % of sampled features have a numeric
 * value are included, filtering out ID / label-like columns.
 */
function discoverGISNumericColumns(fc: FeatureCollection): string[] {
  const sampleSize = Math.min(fc.features.length, 100)
  if (sampleSize === 0) return []

  const counts = new Map<string, number>()
  for (let i = 0; i < sampleSize; i++) {
    const props = fc.features[i]?.properties
    if (!props) continue
    for (const [key, val] of Object.entries(props)) {
      if (METRIC_EXCLUDE.has(key.toLowerCase().trim())) continue
      if (val != null && val !== '' && !isNaN(Number(val))) {
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
  }

  const threshold = Math.max(1, sampleSize * 0.5)
  return Array.from(counts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([key]) => key)
    .sort()
}

function discoverMetrics(
  samples: SamplePoint[],
  chemistry: SoilChemistryRow[],
  customLayers: CustomMapLayer[],
  gisLayers: GISLayer[]
): DiscoveredMetric[] {
  const metrics: DiscoveredMetric[] = []
  const seen = new Set<string>()

  // Discover from raw_data JSONB
  for (const s of samples) {
    if (!s.raw_data) continue
    for (const [key, val] of Object.entries(s.raw_data)) {
      const lower = key.toLowerCase().trim()
      if (METRIC_EXCLUDE.has(lower) || seen.has(lower)) continue
      if (val != null && !isNaN(Number(val))) {
        seen.add(lower)
        metrics.push({ key, label: key, source: 'raw_data' })
      }
    }
  }

  // Discover from soil_chemistry rows
  const chemMetrics = new Map<string, string | null>()
  for (const row of chemistry) {
    if (!chemMetrics.has(row.metric)) {
      chemMetrics.set(row.metric, row.unit)
    }
  }
  for (const [metric, unit] of chemMetrics) {
    const lower = metric.toLowerCase().trim()
    if (seen.has(lower)) continue
    seen.add(lower)
    metrics.push({ key: metric, label: metric, source: 'chemistry', unit: unit ?? undefined })
  }

  // Discover from custom layers
  for (const layer of customLayers) {
    for (const col of layer.metric_columns) {
      const compositeKey = `custom:${layer.id}:${col}`
      metrics.push({
        key: compositeKey,
        label: `${col} (${layer.name})`,
        source: 'custom',
        layerId: layer.id,
      })
    }
  }

  // Discover from GIS layer feature properties
  for (const layer of gisLayers) {
    const numericCols = discoverGISNumericColumns(layer.geojson)
    for (const col of numericCols) {
      const compositeKey = `gis:${layer.id}:${col}`
      metrics.push({
        key: compositeKey,
        label: `${col} (${layer.name})`,
        source: 'gis',
        layerId: layer.id,
      })
    }
  }

  return metrics.sort((a, b) => a.label.localeCompare(b.label))
}

/** Compute the centroid of a GeoJSON geometry as [lat, lng]. */
function getFeatureCentroid(geometry: any): [number, number] | null {
  if (!geometry) return null

  const avgCoords = (coords: number[][]): [number, number] => {
    let lat = 0, lng = 0
    for (const c of coords) { lng += c[0]; lat += c[1] }
    return [lat / coords.length, lng / coords.length]
  }

  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates[1], geometry.coordinates[0]]
    case 'MultiPoint':
    case 'LineString':
      return geometry.coordinates.length > 0 ? avgCoords(geometry.coordinates) : null
    case 'MultiLineString':
    case 'Polygon':
      return geometry.coordinates?.[0]?.length > 0 ? avgCoords(geometry.coordinates[0]) : null
    case 'MultiPolygon': {
      const all = geometry.coordinates.flatMap((poly: number[][][]) => poly[0] || [])
      return all.length > 0 ? avgCoords(all) : null
    }
    default:
      return null
  }
}

function getMetricValue(
  sample: SamplePoint & { latitude: number; longitude: number },
  metric: DiscoveredMetric,
  chemBySample: Map<string, Map<string, number>>
): number | null {
  if (metric.source === 'raw_data') {
    const val = sample.raw_data?.[metric.key]
    if (val == null) return null
    const n = Number(val)
    return isNaN(n) ? null : n
  }
  if (metric.source === 'chemistry') {
    const sampleMetrics = chemBySample.get(sample.sample_no)
    if (!sampleMetrics) return null
    return sampleMetrics.get(metric.key) ?? null
  }
  return null
}

// ---------- Color utilities ----------

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
  const [r1, g1, b1] = parse(a)
  const [r2, g2, b2] = parse(b)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const bl = Math.round(b1 + (b2 - b1) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

const GRADIENT_STOPS = ['#ef4444', '#f59e0b', '#eab308', '#84cc16', '#22c55e']

function metricColor(value: number, min: number, max: number): string {
  if (max === min) return GRADIENT_STOPS[2]
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const segCount = GRADIENT_STOPS.length - 1
  const seg = Math.min(Math.floor(t * segCount), segCount - 1)
  const segT = (t * segCount) - seg
  return lerpColor(GRADIENT_STOPS[seg], GRADIENT_STOPS[seg + 1], segT)
}

function metricColorRGBA(value: number, min: number, max: number, alpha: number): [number, number, number, number] {
  const hex = metricColor(value, min, max)
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    Math.round(alpha * 255),
  ]
}

// ---------- IDW interpolation ----------

interface IDWPoint { lat: number; lng: number; value: number }

function idwInterpolate(
  points: IDWPoint[],
  targetLat: number,
  targetLng: number,
  power: number = 2
): number {
  let weightSum = 0
  let valueSum = 0
  for (const p of points) {
    const dist = Math.sqrt((p.lat - targetLat) ** 2 + (p.lng - targetLng) ** 2)
    if (dist < 1e-10) return p.value
    const w = 1 / (dist ** power)
    weightSum += w
    valueSum += w * p.value
  }
  return valueSum / weightSum
}

/** Leaflet overlay that renders IDW-interpolated heatmap on a canvas */
function IDWOverlay({ points, min, max }: { points: IDWPoint[]; min: number; max: number }) {
  const map = useMap()

  useEffect(() => {
    if (points.length < 3) return

    const CanvasOverlay = L.Layer.extend({
      onAdd(map: L.Map) {
        this._map = map
        this._canvas = L.DomUtil.create('canvas', 'leaflet-layer') as HTMLCanvasElement
        this._canvas.style.position = 'absolute'
        this._canvas.style.pointerEvents = 'none'
        const pane = map.getPane('overlayPane')
        if (pane) pane.appendChild(this._canvas)

        map.on('moveend zoomend resize', this._redraw, this)
        this._redraw()
      },

      onRemove(map: L.Map) {
        if (this._canvas.parentNode) {
          this._canvas.parentNode.removeChild(this._canvas)
        }
        map.off('moveend zoomend resize', this._redraw, this)
      },

      _redraw() {
        const map = this._map
        const canvas = this._canvas as HTMLCanvasElement
        const size = map.getSize()
        const topLeft = map.containerPointToLayerPoint([0, 0])

        L.DomUtil.setPosition(canvas, topLeft)
        canvas.width = size.x
        canvas.height = size.y

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const STEP = 3 // compute IDW every STEP pixels (lower = smoother)
        const smallW = Math.ceil(size.x / STEP)
        const smallH = Math.ceil(size.y / STEP)

        // Compute bounds padding (extend slightly beyond viewport)
        const bounds = map.getBounds()
        const pad = 0.1
        const latRange = bounds.getNorth() - bounds.getSouth()
        const lngRange = bounds.getEast() - bounds.getWest()
        const paddedBounds = L.latLngBounds(
          [bounds.getSouth() - latRange * pad, bounds.getWest() - lngRange * pad],
          [bounds.getNorth() + latRange * pad, bounds.getEast() + lngRange * pad]
        )

        // Filter points to nearby region for performance
        const nearby = points.filter(p => paddedBounds.contains([p.lat, p.lng]))
        if (nearby.length < 2) {
          ctx.clearRect(0, 0, size.x, size.y)
          return
        }

        // Render IDW at reduced resolution on an offscreen canvas
        const offscreen = document.createElement('canvas')
        offscreen.width = smallW
        offscreen.height = smallH
        const offCtx = offscreen.getContext('2d')
        if (!offCtx) return

        const imageData = offCtx.createImageData(smallW, smallH)

        for (let sy = 0; sy < smallH; sy++) {
          for (let sx = 0; sx < smallW; sx++) {
            const containerPoint = L.point(sx * STEP, sy * STEP).add(topLeft)
            const latlng = map.layerPointToLatLng(containerPoint)
            const val = idwInterpolate(nearby, latlng.lat, latlng.lng)
            const [r, g, b, a] = metricColorRGBA(val, min, max, 0.55)

            const idx = (sy * smallW + sx) * 4
            imageData.data[idx] = r
            imageData.data[idx + 1] = g
            imageData.data[idx + 2] = b
            imageData.data[idx + 3] = a
          }
        }

        offCtx.putImageData(imageData, 0, 0)

        // Scale up with bilinear interpolation for smooth gradients
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(offscreen, 0, 0, size.x, size.y)
      },
    })

    const overlay = new CanvasOverlay()
    overlay.addTo(map)

    return () => {
      overlay.remove()
    }
  }, [map, points, min, max])

  return null
}

// ---------- GIS point extraction ----------

/**
 * Extract [lat, lng] coordinate pairs from Point and MultiPoint features
 * in a FeatureCollection.  Returns them as an array and a boolean indicating
 * whether the layer is *predominantly* point data (>50% of features).
 */
function extractPointCoords(fc: FeatureCollection): { coords: [number, number][]; isPointLayer: boolean } {
  const coords: [number, number][] = []
  let pointFeatureCount = 0

  for (const f of fc.features) {
    const geom = f.geometry
    if (!geom) continue
    if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates as [number, number]
      coords.push([lat, lng])
      pointFeatureCount++
    } else if (geom.type === 'MultiPoint') {
      for (const coord of geom.coordinates) {
        const [lng, lat] = coord as [number, number]
        coords.push([lat, lng])
      }
      pointFeatureCount++
    }
  }

  const isPointLayer = fc.features.length > 0 && pointFeatureCount / fc.features.length > 0.5
  return { coords, isPointLayer }
}

// ---------- Leaflet.heat wrapper ----------

/** Renders a density heatmap from an array of [lat, lng] pairs using leaflet.heat */
function HeatmapLayer({ points }: { points: [number, number][] }) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) return

    const heat = L.heatLayer(
      points.map(([lat, lng]) => [lat, lng] as L.HeatLatLngTuple),
      {
        radius: 18,
        blur: 25,
        maxZoom: 17,
        minOpacity: 0.35,
        gradient: {
          0.2: '#313695',
          0.4: '#4575b4',
          0.5: '#74add1',
          0.6: '#fee090',
          0.7: '#f46d43',
          0.85: '#d73027',
          1.0: '#a50026',
        },
      }
    )
    heat.addTo(map)

    return () => {
      heat.remove()
    }
  }, [map, points])

  return null
}

// ---------- Smooth point overlay ----------

/**
 * Canvas-based point layer that renders all points as soft circles on a single
 * canvas, producing a smooth continuous appearance when points are dense.
 * Falls back to standard CircleMarkers for interactivity (popups).
 */
function SoftPointOverlay({ points, color, opacity = 0.55 }: {
  points: { lat: number; lng: number }[]
  color: string
  opacity?: number
}) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) return

    // Parse hex color to RGB
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)

    const CanvasOverlay = L.Layer.extend({
      onAdd(map: L.Map) {
        this._map = map
        this._canvas = L.DomUtil.create('canvas', 'leaflet-layer') as HTMLCanvasElement
        this._canvas.style.position = 'absolute'
        this._canvas.style.pointerEvents = 'none'
        const pane = map.getPane('overlayPane')
        if (pane) pane.appendChild(this._canvas)
        map.on('moveend zoomend resize', this._redraw, this)
        this._redraw()
      },

      onRemove(map: L.Map) {
        if (this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas)
        map.off('moveend zoomend resize', this._redraw, this)
      },

      _redraw() {
        const map = this._map
        const canvas = this._canvas as HTMLCanvasElement
        const size = map.getSize()
        const topLeft = map.containerPointToLayerPoint([0, 0])

        L.DomUtil.setPosition(canvas, topLeft)
        canvas.width = size.x
        canvas.height = size.y

        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, size.x, size.y)

        const zoom = map.getZoom()
        // Radius in pixels: grows with zoom so points merge into continuous patches
        const radius = Math.max(4, Math.round(6 * Math.pow(1.2, zoom - 14)))
        const blur = Math.max(2, radius * 0.6)

        const bounds = map.getBounds()

        for (const p of points) {
          if (!bounds.contains([p.lat, p.lng])) continue
          const px = map.latLngToLayerPoint([p.lat, p.lng])
          const x = px.x - topLeft.x
          const y = px.y - topLeft.y

          // Draw a radial gradient circle for soft appearance
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius + blur)
          gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`)
          gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${opacity * 0.6})`)
          gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(x, y, radius + blur, 0, Math.PI * 2)
          ctx.fill()
        }
      },
    })

    const overlay = new CanvasOverlay()
    overlay.addTo(map)
    return () => { overlay.remove() }
  }, [map, points, color, opacity])

  return null
}

// ---------- Sub-components ----------

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

function MetricLegend({ label, min, max, unit }: { label: string; min: number; max: number; unit?: string }) {
  const fmt = (v: number) => {
    if (Math.abs(v) >= 1000) return v.toFixed(0)
    if (Math.abs(v) >= 10) return v.toFixed(1)
    return v.toFixed(2)
  }

  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-md border border-brand-grey-2 px-3 py-2">
      <p className="text-xs font-semibold text-brand-black mb-1">
        {label}{unit ? ` (${unit})` : ''}
      </p>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-brand-grey-1 w-10 text-right">{fmt(min)}</span>
        <div
          className="h-2.5 rounded-full flex-1"
          style={{
            minWidth: 100,
            background: `linear-gradient(to right, ${GRADIENT_STOPS.join(', ')})`,
          }}
        />
        <span className="text-[10px] text-brand-grey-1 w-10">{fmt(max)}</span>
      </div>
    </div>
  )
}

// ---------- Main Component ----------

// Application zone colours — amber/orange palette, visually distinct from GIS layers
const APP_ZONE_COLORS = ['#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#ea580c', '#c2410c', '#9a3412']

export default function TrialMap({
  trial,
  samples,
  gisLayers: initialLayers,
  customLayers: initialCustomLayers = [],
  soilChemistry = [],
  linkedFields = [],
  fieldGisLayers: initialFieldGisLayers = [],
  applications: initialApplications = [],
  supabaseUrl,
}: TrialMapProps) {
  const [gisLayers, setGisLayers] = useState(initialLayers)
  const [customLayers, setCustomLayers] = useState(initialCustomLayers)
  const [uploading, setUploading] = useState(false)
  const [uploadingCSV, setUploadingCSV] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [activeMetric, setActiveMetric] = useState<string | null>(null)
  const [showInterpolation, setShowInterpolation] = useState(true)
  // Per-layer override: true = force heatmap, false = force points, undefined = auto
  const [heatmapOverrides, setHeatmapOverrides] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const trialCoord = parseGPS(trial.gps)

  // Sanitise GIS layer geojson at render time to guard against invalid
  // geometries persisted in the DB before upload-time validation existed.
  const sanitizedGisLayers = useMemo(
    () =>
      gisLayers
        .filter((l) => l.geojson && l.geojson.type === 'FeatureCollection')
        .map((l) => ({ ...l, geojson: sanitizeFeatures(l.geojson) }))
        .filter((l) => l.geojson.features?.length > 0),
    [gisLayers]
  )

  // Prepare linked field boundaries for rendering on the map
  const fieldBoundaries = useMemo(
    () =>
      linkedFields
        .filter((lf) => lf.fields?.boundary?.features?.length)
        .map((lf) => ({
          fieldId: lf.fields.id,
          name: lf.fields.name,
          farm: lf.fields.farm,
          area_ha: lf.fields.area_ha,
          boundary: lf.fields.boundary as FeatureCollection,
        })),
    [linkedFields]
  )

  // Sanitise field GIS layers
  const sanitizedFieldGisLayers = useMemo(
    () =>
      initialFieldGisLayers
        .filter((l) => l.geojson && l.geojson.type === 'FeatureCollection')
        .map((l) => ({ ...l, geojson: sanitizeFeatures(l.geojson) }))
        .filter((l) => l.geojson.features?.length > 0),
    [initialFieldGisLayers]
  )

  // Sanitise application zone layers
  const sanitizedApplications = useMemo(
    () =>
      initialApplications
        .filter((a) => a.geojson && a.geojson.type === 'FeatureCollection')
        .map((a) => ({ ...a, geojson: sanitizeFeatures(a.geojson) }))
        .filter((a) => a.geojson.features?.length > 0),
    [initialApplications]
  )

  // Discover available numeric metrics from all data sources
  const availableMetrics = useMemo(
    () => discoverMetrics(samples, soilChemistry, customLayers, sanitizedGisLayers),
    [samples, soilChemistry, customLayers, sanitizedGisLayers]
  )

  // Build chemistry lookup: sample_no -> metric -> value
  const chemBySample = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    for (const row of soilChemistry) {
      if (row.value == null) continue
      if (!map.has(row.sample_no)) map.set(row.sample_no, new Map())
      map.get(row.sample_no)!.set(row.metric, row.value)
    }
    return map
  }, [soilChemistry])

  const selectedMetric = useMemo(
    () => availableMetrics.find(m => m.key === activeMetric) ?? null,
    [availableMetrics, activeMetric]
  )

  const samplePoints = useMemo(
    () =>
      samples.filter(
        (s): s is SamplePoint & { latitude: number; longitude: number } =>
          s.latitude != null && s.longitude != null
      ),
    [samples]
  )

  // Build GPS lookup from soil_health_samples for CSV matching
  const sampleGPS = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>()
    for (const s of samplePoints) {
      map.set(s.sample_no, { lat: s.latitude, lng: s.longitude })
    }
    return map
  }, [samplePoints])

  // Gather all points for auto-bounds
  const allPoints: [number, number][] = useMemo(() => {
    const pts: [number, number][] = []
    if (trialCoord) pts.push(trialCoord)
    for (const s of samplePoints) {
      pts.push([s.latitude, s.longitude])
    }
    for (const cl of customLayers) {
      for (const p of cl.points) {
        pts.push([p.lat, p.lng])
      }
    }
    return pts
  }, [trialCoord, samplePoints, customLayers])

  // Pre-compute point data for each GIS layer (used for heatmap rendering)
  const gisLayerPointData = useMemo(
    () => {
      const map = new Map<string, { coords: [number, number][]; isPointLayer: boolean }>()
      for (const l of sanitizedGisLayers) {
        map.set(l.id, extractPointCoords(l.geojson))
      }
      return map
    },
    [sanitizedGisLayers]
  )

  /** Determine if a GIS layer should render as heatmap right now */
  function shouldShowHeatmap(layerId: string): boolean {
    const override = heatmapOverrides[layerId]
    if (override !== undefined) return override
    // Default to polygon/boundary rendering — users can opt-in to heatmap via toggle
    return false
  }

  const allGeoJsons = useMemo(
    () => [
      ...sanitizedGisLayers.map((l) => l.geojson),
      ...fieldBoundaries.map((fb) => fb.boundary),
      ...sanitizedFieldGisLayers.map((l) => l.geojson),
      ...sanitizedApplications.map((a) => a.geojson),
    ],
    [sanitizedGisLayers, fieldBoundaries, sanitizedFieldGisLayers, sanitizedApplications]
  )

  // Compute metric overlay data when a metric is active
  const metricLayerData = useMemo(() => {
    if (!selectedMetric) return null

    // GIS layer metric — extract values from feature properties + centroids
    if (selectedMetric.source === 'gis' && selectedMetric.layerId) {
      const layer = sanitizedGisLayers.find(l => l.id === selectedMetric.layerId)
      if (!layer) return null
      const colName = selectedMetric.key.split(':')[2] // "gis:layerId:colName"
      const pts: { lat: number; lng: number; value: number; sample: any }[] = []
      for (const feature of layer.geojson.features) {
        const raw = feature.properties?.[colName]
        if (raw == null || raw === '') continue
        const n = Number(raw)
        if (isNaN(n)) continue
        const centroid = getFeatureCentroid(feature.geometry)
        if (!centroid) continue
        pts.push({ lat: centroid[0], lng: centroid[1], value: n, sample: null })
      }
      if (pts.length === 0) return null
      const values = pts.map(p => p.value)
      return { points: pts, min: Math.min(...values), max: Math.max(...values) }
    }

    // Custom layer metric
    if (selectedMetric.source === 'custom' && selectedMetric.layerId) {
      const layer = customLayers.find(l => l.id === selectedMetric.layerId)
      if (!layer) return null
      const colName = selectedMetric.key.split(':')[2] // "custom:layerId:colName"
      const pts: { lat: number; lng: number; value: number; label: string }[] = []
      for (const p of layer.points) {
        const val = p.values[colName]
        if (val != null) pts.push({ lat: p.lat, lng: p.lng, value: val, label: p.sample_no || '' })
      }
      if (pts.length === 0) return null
      const values = pts.map(p => p.value)
      return {
        points: pts.map(p => ({ lat: p.lat, lng: p.lng, value: p.value, sample: { sample_no: p.label, property: null, block: null } as any })),
        min: Math.min(...values),
        max: Math.max(...values),
      }
    }

    // System data metric (raw_data or chemistry)
    const points: { lat: number; lng: number; value: number; sample: typeof samplePoints[0] }[] = []
    for (const s of samplePoints) {
      const val = getMetricValue(s, selectedMetric, chemBySample)
      if (val != null) points.push({ lat: s.latitude, lng: s.longitude, value: val, sample: s })
    }
    if (points.length === 0) return null
    const values = points.map(p => p.value)
    return { points, min: Math.min(...values), max: Math.max(...values) }
  }, [selectedMetric, samplePoints, chemBySample, customLayers, sanitizedGisLayers])

  // Default center: trial GPS, first sample point, or Australia
  const defaultCenter: [number, number] = trialCoord
    ?? (samplePoints.length > 0 ? [samplePoints[0].latitude, samplePoints[0].longitude] : [-28.0, 134.0])

  const defaultZoom = trialCoord || samplePoints.length > 0 ? 14 : 4

  // ---------- GIS file upload ----------

  async function handleGISUpload(fileList: FileList) {
    const file = fileList[0]
    if (!file) return

    setUploadError(null)
    const fileType = detectGISFileType(file.name)
    if (!fileType) {
      setUploadError('Unsupported file type. Please upload .geojson, .kml, .kmz, or .zip (zipped shapefile) files.')
      return
    }

    // Warn early for raw .shp — shpjs needs the full bundle in a .zip
    if (file.name.toLowerCase().endsWith('.shp')) {
      setUploadError(
        'A raw .shp file cannot be processed on its own. ' +
        'Please zip the .shp together with its companion files (.dbf, .shx, .prj) and upload the .zip instead.'
      )
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.`)
      return
    }

    setUploading(true)
    const supabase = createClient()

    try {
      // Parse into one or more layers (multi-layer ZIP support)
      const parsedLayers = await parseGISFileMultiLayer(file, fileType)
      const nonEmpty = parsedLayers.filter((l) => l.geojson.features.length > 0)

      if (nonEmpty.length === 0) {
        throw new Error('No features found in the uploaded file.')
      }

      // Upload the raw file once to storage
      const rawId = crypto.randomUUID()
      const ext = file.name.split('.').pop()?.toLowerCase() || fileType
      const rawStoragePath = `${trial.id}/${rawId}.${ext}`

      const { error: storageError } = await supabase.storage
        .from('trial-gis')
        .upload(rawStoragePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        })

      if (storageError) {
        throw new Error(`File storage failed: ${storageError.message}`)
      }

      // Upload each layer as a separate record
      const newLayers: GISLayer[] = []
      const storagePaths: string[] = [rawStoragePath]

      for (const parsed of nonEmpty) {
        const layerId = crypto.randomUUID()

        // Upload parsed GeoJSON to storage so the API route can read it
        const geojsonPath = `${trial.id}/${layerId}.geojson`
        const geojsonBlob = new Blob([JSON.stringify(parsed.geojson)], { type: 'application/json' })
        const { error: geojsonStorageError } = await supabase.storage
          .from('trial-gis')
          .upload(geojsonPath, geojsonBlob, {
            contentType: 'application/json',
            upsert: true,
          })

        if (geojsonStorageError) {
          throw new Error(`GeoJSON storage failed: ${geojsonStorageError.message}`)
        }

        storagePaths.push(geojsonPath)

        const formData = new FormData()
        formData.append('trial_id', trial.id)
        formData.append('name', parsed.name)
        formData.append('file_type', fileType)
        formData.append('geojson_path', geojsonPath)
        formData.append('feature_count', String(parsed.geojson.features.length))
        formData.append('storage_path', rawStoragePath)

        const res = await fetch('/api/upload/gis', { method: 'POST', body: formData })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Upload failed for layer "${parsed.name}" (${res.status})`)
        }

        const { layer } = await res.json()
        newLayers.push(layer)
      }

      setGisLayers((prev) => [...prev, ...newLayers])
    } catch (err: any) {
      console.error('GIS upload failed:', err)
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ---------- CSV data layer upload ----------

  async function handleCSVUpload(fileList: FileList) {
    const file = fileList[0]
    if (!file) return

    setUploadError(null)

    if (!file.name.endsWith('.csv')) {
      setUploadError('Please upload a .csv file.')
      return
    }

    setUploadingCSV(true)

    try {
      const text = await file.text()
      const rows = parseCSV(text)
      if (rows.length === 0) {
        throw new Error('CSV file is empty or has no data rows.')
      }

      const headers = Object.keys(rows[0])

      // Detect coordinate columns
      const latCol = headers.find(h => ['latitude', 'lat'].includes(h.toLowerCase().trim()))
      const lngCol = headers.find(h => ['longitude', 'lng', 'lon', 'long'].includes(h.toLowerCase().trim()))
      const sampleCol = headers.find(h =>
        ['sample_no', 'sampleno', 'sample no', 'sample', 'sample id', 'sampleid'].includes(h.toLowerCase().trim())
      )

      const hasOwnCoords = latCol && lngCol
      const canMatchSamples = sampleCol && sampleGPS.size > 0

      if (!hasOwnCoords && !canMatchSamples) {
        throw new Error(
          'CSV must have latitude/longitude columns, or a sample_no column to match against existing soil sample GPS coordinates.'
        )
      }

      // Detect numeric metric columns (exclude identity/coord columns)
      const excludeLower = new Set([
        ...(latCol ? [latCol.toLowerCase()] : []),
        ...(lngCol ? [lngCol.toLowerCase()] : []),
        ...(sampleCol ? [sampleCol.toLowerCase()] : []),
        ...METRIC_EXCLUDE,
      ])

      const metricCols: string[] = []
      for (const h of headers) {
        if (excludeLower.has(h.toLowerCase().trim())) continue
        // Check if at least one row has a numeric value for this column
        const hasNumeric = rows.some(r => r[h] != null && r[h] !== '' && !isNaN(Number(r[h])))
        if (hasNumeric) metricCols.push(h)
      }

      if (metricCols.length === 0) {
        throw new Error('No numeric data columns found in CSV. Need at least one column with numbers.')
      }

      // Build points array
      const points: { sample_no?: string; lat: number; lng: number; values: Record<string, number> }[] = []
      let matchedCount = 0
      let skippedCount = 0

      for (const row of rows) {
        let lat: number | null = null
        let lng: number | null = null
        let sampleNo: string | undefined

        if (hasOwnCoords) {
          lat = parseFloat(row[latCol!])
          lng = parseFloat(row[lngCol!])
        }

        if (sampleCol) {
          sampleNo = row[sampleCol]?.trim()
          if (sampleNo && (!hasOwnCoords || isNaN(lat!) || isNaN(lng!))) {
            const gps = sampleGPS.get(sampleNo)
            if (gps) {
              lat = gps.lat
              lng = gps.lng
              matchedCount++
            }
          }
        }

        if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
          skippedCount++
          continue
        }

        const values: Record<string, number> = {}
        for (const col of metricCols) {
          const n = Number(row[col])
          if (!isNaN(n)) values[col] = n
        }

        if (Object.keys(values).length > 0) {
          points.push({ sample_no: sampleNo, lat, lng, values })
        }
      }

      if (points.length === 0) {
        throw new Error(
          `No valid data points could be extracted. ${skippedCount} rows had no GPS coordinates.` +
          (canMatchSamples ? ` Only ${matchedCount} rows matched sample_no to existing GPS points.` : '')
        )
      }

      // Save to API
      const res = await fetch('/api/map-layers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trial_id: trial.id,
          name: file.name.replace(/\.csv$/i, ''),
          metric_columns: metricCols,
          points,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Upload failed (${res.status})`)
      }

      const { layer } = await res.json()
      setCustomLayers(prev => [...prev, layer])
    } catch (err: any) {
      console.error('CSV upload failed:', err)
      setUploadError(err.message || 'CSV upload failed')
    } finally {
      setUploadingCSV(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  // ---------- Delete handlers ----------

  async function handleDeleteGIS(layerId: string) {
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

  async function handleDeleteCustom(layerId: string) {
    setDeleting(layerId)
    try {
      const res = await fetch(`/api/map-layers/${layerId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setCustomLayers(prev => prev.filter(l => l.id !== layerId))
      // Clear active metric if it belonged to this layer
      if (activeMetric?.includes(layerId)) setActiveMetric(null)
    } catch (err) {
      console.error('Custom layer delete failed:', err)
    } finally {
      setDeleting(null)
    }
  }

  // ---------- Render ----------

  const totalLayers = sanitizedGisLayers.length + customLayers.length + fieldBoundaries.length + sanitizedFieldGisLayers.length + sanitizedApplications.length

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <p className="signpost-label">
          TRIAL MAP
          {totalLayers > 0 && (
            <span className="ml-2 text-brand-grey-1 font-normal">
              ({totalLayers} layer{totalLayers !== 1 ? 's' : ''})
            </span>
          )}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Metric layer selector */}
          {availableMetrics.length > 0 && (
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-brand-grey-1 shrink-0" />
              <select
                value={activeMetric ?? ''}
                onChange={(e) => { setActiveMetric(e.target.value || null); setShowInterpolation(true) }}
                className="text-sm border border-brand-grey-2 rounded-md px-2 py-1.5 bg-white text-brand-black focus:outline-none focus:ring-1 focus:ring-brand-black max-w-[220px]"
              >
                <option value="">Colour by metric...</option>
                {availableMetrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}{m.unit ? ` (${m.unit})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Interpolation toggle */}
          {metricLayerData && metricLayerData.points.length >= 3 && (
            <button
              onClick={() => setShowInterpolation(v => !v)}
              className={`flex items-center gap-1.5 text-sm px-2 py-1.5 rounded-md border transition-colors ${
                showInterpolation
                  ? 'bg-brand-black text-white border-brand-black'
                  : 'bg-white text-brand-black border-brand-grey-2 hover:border-brand-black'
              }`}
              title="Toggle IDW interpolation heatmap"
            >
              <Grid3X3 size={14} />
              Interpolate
            </button>
          )}

          {/* CSV data layer upload */}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleCSVUpload(e.target.files)
              }
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => csvInputRef.current?.click()}
            disabled={uploadingCSV}
          >
            {uploadingCSV ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <FileSpreadsheet size={14} />
                Upload Data Layer
              </>
            )}
          </Button>

          {/* GIS file upload */}
          <input
            ref={fileInputRef}
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
      <div className="relative rounded-lg overflow-hidden border border-brand-grey-2" style={{ height: '500px' }}>
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          className="h-full w-full"
          scrollWheelZoom={true}
          preferCanvas={true}
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

            {/* Sample points — soft canvas underlay + small interactive markers */}
            {samplePoints.length > 0 && (
              <LayersControl.Overlay checked name={`Soil Samples (${samplePoints.length})`}>
                <FeatureGroup>
                  <SoftPointOverlay
                    points={samplePoints.map(s => ({ lat: s.latitude, lng: s.longitude }))}
                    color="#10b981"
                    opacity={0.5}
                  />
                  {samplePoints.map((s, i) => (
                    <CircleMarker
                      key={i}
                      center={[s.latitude, s.longitude]}
                      radius={4}
                      pathOptions={{ color: '#fff', fillColor: '#10b981', fillOpacity: 0.85, weight: 1.5 }}
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

            {/* GIS layers — heatmap for dense point layers, GeoJSON for others */}
            {sanitizedGisLayers.map((layer, idx) => {
              const color = layer.style?.color || LAYER_COLORS[idx % LAYER_COLORS.length]
              const useHeatmap = shouldShowHeatmap(layer.id)
              const pointData = gisLayerPointData.get(layer.id)

              // Check if a GIS attribute metric is active for this layer
              const isGisMetricActive = selectedMetric?.source === 'gis' && selectedMetric.layerId === layer.id
              const gisMetricCol = isGisMetricActive ? selectedMetric!.key.split(':')[2] : null

              // When coloring by attribute, skip heatmap mode so the value colors are visible
              if (!isGisMetricActive && useHeatmap && pointData && pointData.coords.length > 0) {
                return (
                  <LayersControl.Overlay checked key={layer.id} name={`${layer.name} (heatmap)`}>
                    <FeatureGroup>
                      <HeatmapLayer points={pointData.coords} />
                    </FeatureGroup>
                  </LayersControl.Overlay>
                )
              }

              return (
                <LayersControl.Overlay checked key={layer.id} name={isGisMetricActive ? `${layer.name} — ${gisMetricCol}` : layer.name}>
                  <GeoJSON
                    key={`${layer.id}-${gisMetricCol || 'default'}`}
                    data={layer.geojson}
                    style={(feature) => {
                      if (isGisMetricActive && gisMetricCol && metricLayerData && feature) {
                        const raw = feature.properties?.[gisMetricCol]
                        if (raw != null && raw !== '') {
                          const n = Number(raw)
                          if (!isNaN(n)) {
                            const c = metricColor(n, metricLayerData.min, metricLayerData.max)
                            return { color: c, fillColor: c, fillOpacity: 0.65, weight: 1 }
                          }
                        }
                      }
                      return {
                        color,
                        weight: layer.style?.weight ?? 2,
                        fillOpacity: layer.style?.fillOpacity ?? 0.15,
                        fillColor: color,
                      }
                    }}
                    pointToLayer={(feature, latlng) => {
                      if (isGisMetricActive && gisMetricCol && metricLayerData) {
                        const raw = feature.properties?.[gisMetricCol]
                        if (raw != null && raw !== '') {
                          const n = Number(raw)
                          if (!isNaN(n)) {
                            const c = metricColor(n, metricLayerData.min, metricLayerData.max)
                            return L.circleMarker(latlng, { radius: 4, color: c, fillColor: c, fillOpacity: 0.85, weight: 1 })
                          }
                        }
                      }
                      return L.circleMarker(latlng, {
                        radius: 4,
                        color: '#fff',
                        fillColor: color,
                        fillOpacity: 0.85,
                        weight: 1.5,
                      })
                    }}
                    onEachFeature={(feature, leafletLayer) => {
                      const props = feature.properties
                      if (props && Object.keys(props).length > 0) {
                        const html = Object.entries(props)
                          .filter(([, v]) => v != null && v !== '')
                          .map(([k, v]) => `<b>${escapeHtml(String(k))}:</b> ${escapeHtml(String(v))}`)
                          .join('<br/>')
                        if (html) leafletLayer.bindPopup(`<div class="text-xs">${html}</div>`)
                      }
                    }}
                  />
                </LayersControl.Overlay>
              )
            })}

            {/* Linked field boundaries */}
            {fieldBoundaries.map((fb) => (
              <LayersControl.Overlay checked key={`field-boundary-${fb.fieldId}`} name={`Field: ${fb.name}`}>
                <GeoJSON
                  key={`field-boundary-${fb.fieldId}`}
                  data={fb.boundary}
                  style={{
                    color: '#22c55e',
                    weight: 3,
                    fillOpacity: 0.05,
                    fillColor: '#22c55e',
                    dashArray: '8, 4',
                  }}
                  onEachFeature={(_feature, layer) => {
                    const parts = [fb.name]
                    if (fb.farm) parts.push(fb.farm)
                    if (fb.area_ha) parts.push(`${fb.area_ha} ha`)
                    layer.bindPopup(
                      `<div class="text-sm"><p class="font-semibold">${escapeHtml(parts[0])}</p>${parts.slice(1).map(p => `<p class="text-gray-500">${escapeHtml(p)}</p>`).join('')}</div>`
                    )
                  }}
                />
              </LayersControl.Overlay>
            ))}

            {/* Linked field GIS layers */}
            {sanitizedFieldGisLayers.map((layer, idx) => {
              const color = layer.style?.color || LAYER_COLORS[(sanitizedGisLayers.length + idx + 2) % LAYER_COLORS.length]
              return (
                <LayersControl.Overlay checked key={`field-gis-${layer.id}`} name={`Field GIS: ${layer.name}`}>
                  <GeoJSON
                    key={`field-gis-${layer.id}`}
                    data={layer.geojson}
                    style={{
                      color,
                      weight: layer.style?.weight ?? 2,
                      fillOpacity: layer.style?.fillOpacity ?? 0.15,
                      fillColor: color,
                    }}
                    onEachFeature={(feature, leafletLayer) => {
                      const props = feature.properties
                      if (props && Object.keys(props).length > 0) {
                        const html = Object.entries(props)
                          .filter(([, v]) => v != null && v !== '')
                          .map(([k, v]) => `<b>${escapeHtml(String(k))}:</b> ${escapeHtml(String(v))}`)
                          .join('<br/>')
                        if (html) leafletLayer.bindPopup(`<div class="text-xs">${html}</div>`)
                      }
                    }}
                  />
                </LayersControl.Overlay>
              )
            })}

            {/* Application zones — distinctive amber/orange dashed style */}
            {sanitizedApplications.map((app, idx) => {
              const color = app.style?.color || APP_ZONE_COLORS[idx % APP_ZONE_COLORS.length]
              const label = app.trt_number != null
                ? `App: ${app.name} (Trt ${app.trt_number})`
                : `App: ${app.name}`
              return (
                <LayersControl.Overlay checked key={`app-${app.id}`} name={label}>
                  <GeoJSON
                    key={`app-${app.id}`}
                    data={app.geojson}
                    style={{
                      color,
                      weight: app.style?.weight ?? 2.5,
                      fillOpacity: app.style?.fillOpacity ?? 0.25,
                      fillColor: color,
                      dashArray: '6, 4',
                    }}
                    onEachFeature={(feature, leafletLayer) => {
                      const parts: string[] = [`<b>${escapeHtml(app.name)}</b>`]
                      if (app.application_type) parts.push(`Type: ${escapeHtml(app.application_type)}`)
                      if (app.product) parts.push(`Product: ${escapeHtml(app.product)}`)
                      if (app.rate) parts.push(`Rate: ${escapeHtml(app.rate)}`)
                      if (app.trt_number != null) parts.push(`Treatment: ${app.trt_number}`)
                      if (app.date_applied) parts.push(`Applied: ${escapeHtml(app.date_applied)}`)
                      // Also show feature properties if present
                      const props = feature.properties
                      if (props && Object.keys(props).length > 0) {
                        const propHtml = Object.entries(props)
                          .filter(([, v]) => v != null && v !== '')
                          .map(([k, v]) => `${escapeHtml(String(k))}: ${escapeHtml(String(v))}`)
                        parts.push(...propHtml)
                      }
                      leafletLayer.bindPopup(`<div class="text-xs">${parts.join('<br/>')}</div>`)
                    }}
                  />
                </LayersControl.Overlay>
              )
            })}

            {/* Metric overlay (color-coded points) — skip for GIS metrics since the layer itself is color-coded */}
            {metricLayerData && selectedMetric && selectedMetric.source !== 'gis' && (
              <LayersControl.Overlay checked name={`${selectedMetric.label.slice(0, 30)} (metric)`}>
                <FeatureGroup>
                  {metricLayerData.points.map((pt, i) => {
                    const color = metricColor(pt.value, metricLayerData.min, metricLayerData.max)
                    // When interpolation surface is active, show dots as subtle interaction targets
                    const interpolationActive = showInterpolation && metricLayerData.points.length >= 3
                    return (
                      <CircleMarker
                        key={`metric-${i}`}
                        center={[pt.lat, pt.lng]}
                        radius={interpolationActive ? 4 : 5}
                        pathOptions={{
                          color: interpolationActive ? '#fff' : color,
                          fillColor: color,
                          fillOpacity: interpolationActive ? 0.7 : 0.85,
                          weight: interpolationActive ? 1.5 : 1,
                        }}
                      >
                        <Popup>
                          <div className="text-sm">
                            <p className="font-semibold">
                              {pt.sample?.sample_no ? `Sample ${pt.sample.sample_no}` : `Point ${i + 1}`}
                            </p>
                            <p className="text-brand-black">
                              {selectedMetric.label}: <span className="font-mono font-semibold">{pt.value}</span>
                              {selectedMetric.unit ? ` ${selectedMetric.unit}` : ''}
                            </p>
                            {pt.sample?.property && <p className="text-gray-500">{pt.sample.property}</p>}
                            {pt.sample?.block && <p className="text-gray-500">Block: {pt.sample.block}</p>}
                            <p className="font-mono text-xs mt-1">{pt.lat}, {pt.lng}</p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    )
                  })}
                </FeatureGroup>
              </LayersControl.Overlay>
            )}

            {/* Custom data layer points (when no metric selected, show as basic markers) */}
            {!selectedMetric && customLayers.map((layer, idx) => {
              const layerColor = LAYER_COLORS[(sanitizedGisLayers.length + idx) % LAYER_COLORS.length]
              return (
                <LayersControl.Overlay checked key={`custom-${layer.id}`} name={`${layer.name} (${layer.point_count} pts)`}>
                  <FeatureGroup>
                    <SoftPointOverlay
                      points={layer.points.map(pt => ({ lat: pt.lat, lng: pt.lng }))}
                      color={layerColor}
                      opacity={0.5}
                    />
                    {layer.points.map((pt, i) => (
                      <CircleMarker
                        key={i}
                        center={[pt.lat, pt.lng]}
                        radius={4}
                        pathOptions={{ color: '#fff', fillColor: layerColor, fillOpacity: 0.85, weight: 1.5 }}
                      >
                        <Popup>
                          <div className="text-sm">
                            {pt.sample_no && <p className="font-semibold">Sample {pt.sample_no}</p>}
                            {Object.entries(pt.values).map(([k, v]) => (
                              <p key={k}>{k}: <span className="font-mono">{v}</span></p>
                            ))}
                            <p className="font-mono text-xs mt-1">{pt.lat}, {pt.lng}</p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    ))}
                  </FeatureGroup>
                </LayersControl.Overlay>
              )
            })}
          </LayersControl>

          {/* IDW interpolation heatmap overlay */}
          {showInterpolation && metricLayerData && metricLayerData.points.length >= 3 && (
            <IDWOverlay
              points={metricLayerData.points.map(p => ({ lat: p.lat, lng: p.lng, value: p.value }))}
              min={metricLayerData.min}
              max={metricLayerData.max}
            />
          )}

          <FitBounds points={allPoints} geoJsonLayers={allGeoJsons} />
        </MapContainer>

        {/* Metric color legend */}
        {metricLayerData && selectedMetric && (
          <MetricLegend
            label={selectedMetric.label}
            min={metricLayerData.min}
            max={metricLayerData.max}
            unit={selectedMetric.unit}
          />
        )}
      </div>

      {/* Layer list */}
      {(sanitizedGisLayers.length > 0 || customLayers.length > 0 || fieldBoundaries.length > 0 || sanitizedFieldGisLayers.length > 0 || sanitizedApplications.length > 0) && (
        <div className="mt-4">
          <p className="signpost-label mb-2">LAYERS</p>
          <div className="space-y-2">
            {/* GIS layers */}
            {sanitizedGisLayers.map((layer, idx) => {
              const color = layer.style?.color || LAYER_COLORS[idx % LAYER_COLORS.length]
              const pointData = gisLayerPointData.get(layer.id)
              const isPointLayer = pointData?.isPointLayer && pointData.coords.length > 0
              const isHeatmap = shouldShowHeatmap(layer.id)
              const gisMetricCount = availableMetrics.filter(m => m.source === 'gis' && m.layerId === layer.id).length
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
                        {gisMetricCount > 0 && ` \u00b7 ${gisMetricCount} variable${gisMetricCount !== 1 ? 's' : ''}`}
                        {isHeatmap && ' \u00b7 heatmap'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Heatmap / points toggle — shown for point-based GIS layers */}
                    {isPointLayer && (
                      <button
                        onClick={() =>
                          setHeatmapOverrides((prev) => ({
                            ...prev,
                            [layer.id]: !isHeatmap,
                          }))
                        }
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${
                          isHeatmap
                            ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                            : 'bg-white text-brand-grey-1 border-brand-grey-2 hover:border-brand-black'
                        }`}
                        title={isHeatmap ? 'Switch to individual points' : 'Switch to heatmap'}
                      >
                        {isHeatmap ? <CircleDot size={12} /> : <Flame size={12} />}
                        {isHeatmap ? 'Points' : 'Heatmap'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteGIS(layer.id)}
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
                </div>
              )
            })}

            {/* Custom data layers */}
            {customLayers.map((layer, idx) => {
              const color = LAYER_COLORS[(sanitizedGisLayers.length + idx) % LAYER_COLORS.length]
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
                        CSV &middot; {layer.point_count} point{layer.point_count !== 1 ? 's' : ''} &middot; {layer.metric_columns.length} metric{layer.metric_columns.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteCustom(layer.id)}
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

            {/* Linked field boundaries */}
            {fieldBoundaries.map((fb) => (
              <div
                key={`field-boundary-${fb.fieldId}`}
                className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                  <div>
                    <p className="text-sm font-medium">{fb.name}</p>
                    <p className="text-xs text-brand-grey-1">
                      Field boundary{fb.farm ? ` \u00b7 ${fb.farm}` : ''}{fb.area_ha ? ` \u00b7 ${fb.area_ha} ha` : ''}
                    </p>
                  </div>
                </div>
                <a
                  href={`/fields/${fb.fieldId}`}
                  className="text-xs text-meta-blue hover:underline"
                >
                  View field
                </a>
              </div>
            ))}

            {/* Linked field GIS layers */}
            {sanitizedFieldGisLayers.map((layer, idx) => {
              const color = layer.style?.color || LAYER_COLORS[(sanitizedGisLayers.length + idx + 2) % LAYER_COLORS.length]
              return (
                <div
                  key={`field-gis-${layer.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <div>
                      <p className="text-sm font-medium">{layer.name}</p>
                      <p className="text-xs text-brand-grey-1">
                        Field GIS &middot; {layer.file_type.toUpperCase()} &middot; {layer.feature_count} feature{layer.feature_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Application zones */}
            {sanitizedApplications.map((app, idx) => {
              const color = app.style?.color || APP_ZONE_COLORS[idx % APP_ZONE_COLORS.length]
              return (
                <div
                  key={`app-${app.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <div>
                      <p className="text-sm font-medium">{app.name}</p>
                      <p className="text-xs text-brand-grey-1">
                        Application{app.application_type ? ` \u00b7 ${app.application_type}` : ''}
                        {app.product ? ` \u00b7 ${app.product}` : ''}
                        {app.rate ? ` \u00b7 ${app.rate}` : ''}
                        {app.trt_number != null ? ` \u00b7 Trt ${app.trt_number}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!trialCoord && samplePoints.length === 0 && sanitizedGisLayers.length === 0 && customLayers.length === 0 && (
        <div className="text-center py-8 text-brand-grey-1">
          <MapPin size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium mb-1">No spatial data yet</p>
          <p className="text-xs">
            Upload a GIS file (zipped Shapefile, KML, GeoJSON) or a CSV data layer to see it on the map.
            <br />
            GPS coordinates from the trial summary and soil samples will also appear here.
          </p>
        </div>
      )}
    </div>
  )
}
