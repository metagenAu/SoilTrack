'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Download, Grid3X3, Pencil, Save, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import SamplingPlanMapWrapper from './SamplingPlanMapWrapper'
import type { FeatureCollection } from 'geojson'

interface SamplingPoint {
  lat: number
  lng: number
  label: string
}

interface SamplingPlan {
  id: string
  name: string
  strategy: string
  num_points: number
  spacing_ha: number | null
  points: SamplingPoint[]
  created_at: string
}

interface SamplingPlanPanelProps {
  fieldId: string
  boundary: FeatureCollection | null
  areaHa: number | null
  samplingPlans: Array<SamplingPlan>
}

type InputMode = 'count' | 'density'

/** Metres per degree of latitude (constant). */
const METRES_PER_DEG_LAT = 111320

/**
 * Check if a point is inside a polygon using ray-casting algorithm.
 */
function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1], yi = polygon[i][0]
    const xj = polygon[j][1], yj = polygon[j][0]

    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi

    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Extract the bounding box and polygon rings from a boundary FeatureCollection.
 */
function extractBoundaryInfo(boundary: FeatureCollection) {
  const polygons: number[][][] = []
  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity

  for (const feature of boundary.features) {
    const geom = feature.geometry
    let rings: number[][][] = []

    if (geom.type === 'Polygon') {
      rings = geom.coordinates as number[][][]
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates as number[][][][]) {
        rings.push(...poly)
      }
    }

    for (const ring of rings) {
      polygons.push(ring)
      for (const coord of ring) {
        // GeoJSON is [lng, lat]
        if (coord[1] < minLat) minLat = coord[1]
        if (coord[1] > maxLat) maxLat = coord[1]
        if (coord[0] < minLng) minLng = coord[0]
        if (coord[0] > maxLng) maxLng = coord[0]
      }
    }
  }

  return { polygons, minLat, maxLat, minLng, maxLng }
}

/**
 * Convert hectare cell size to lat/lng grid spacing using geodesic approximation.
 * 1 ha = 10,000 m². For a square cell of X ha, side = sqrt(X * 10000) metres.
 */
function haToGridSpacing(haPerSample: number, centerLat: number): { latStep: number; lngStep: number } {
  const cellSideMetres = Math.sqrt(haPerSample * 10000)
  const latStep = cellSideMetres / METRES_PER_DEG_LAT
  const lngStep = cellSideMetres / (METRES_PER_DEG_LAT * Math.cos(centerLat * Math.PI / 180))
  return { latStep, lngStep }
}

/**
 * Generate random points inside the boundary polygon.
 */
function generateRandomPoints(
  boundary: FeatureCollection,
  numPoints: number
): SamplingPoint[] {
  const { polygons, minLat, maxLat, minLng, maxLng } = extractBoundaryInfo(boundary)
  if (polygons.length === 0) return []

  const points: SamplingPoint[] = []
  let attempts = 0
  const maxAttempts = numPoints * 100

  while (points.length < numPoints && attempts < maxAttempts) {
    attempts++
    const lat = minLat + Math.random() * (maxLat - minLat)
    const lng = minLng + Math.random() * (maxLng - minLng)

    // Check if point is inside any polygon
    const inside = polygons.some((poly) => pointInPolygon(lat, lng, poly))
    if (inside) {
      points.push({
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
        label: `S${points.length + 1}`,
      })
    }
  }

  return points
}

/**
 * Generate grid-based points inside the boundary polygon.
 * When numPoints is provided, the grid dimensions are estimated from the point count.
 */
function generateGridPoints(
  boundary: FeatureCollection,
  numPoints: number
): SamplingPoint[] {
  const { polygons, minLat, maxLat, minLng, maxLng } = extractBoundaryInfo(boundary)
  if (polygons.length === 0) return []

  // Estimate grid dimensions
  const aspect = (maxLng - minLng) / (maxLat - minLat)
  const rows = Math.max(1, Math.round(Math.sqrt(numPoints / aspect)))
  const cols = Math.max(1, Math.round(numPoints / rows))

  const latStep = (maxLat - minLat) / (rows + 1)
  const lngStep = (maxLng - minLng) / (cols + 1)

  const points: SamplingPoint[] = []
  let idx = 1

  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const lat = minLat + r * latStep
      const lng = minLng + c * lngStep

      const inside = polygons.some((poly) => pointInPolygon(lat, lng, poly))
      if (inside) {
        points.push({
          lat: Math.round(lat * 1e6) / 1e6,
          lng: Math.round(lng * 1e6) / 1e6,
          label: `G${idx}`,
        })
        idx++
      }
    }
  }

  return points
}

/**
 * Generate grid points using hectare-based spacing.
 * Each grid cell covers approximately `haPerSample` hectares.
 * Grid steps are computed geodesically so cells are square on the ground.
 */
function generateGridPointsByDensity(
  boundary: FeatureCollection,
  haPerSample: number
): SamplingPoint[] {
  const { polygons, minLat, maxLat, minLng, maxLng } = extractBoundaryInfo(boundary)
  if (polygons.length === 0) return []

  const centerLat = (minLat + maxLat) / 2
  const { latStep, lngStep } = haToGridSpacing(haPerSample, centerLat)

  // Offset the grid by half a cell so points sit at cell centres
  const startLat = minLat + latStep / 2
  const startLng = minLng + lngStep / 2

  const points: SamplingPoint[] = []
  let idx = 1

  let lat = startLat
  while (lat <= maxLat) {
    let lng = startLng
    while (lng <= maxLng) {
      const inside = polygons.some((poly) => pointInPolygon(lat, lng, poly))
      if (inside) {
        points.push({
          lat: Math.round(lat * 1e6) / 1e6,
          lng: Math.round(lng * 1e6) / 1e6,
          label: `G${idx}`,
        })
        idx++
      }
      lng += lngStep
    }
    lat += latStep
  }

  return points
}

/**
 * Generate stratified random points (divide boundary into a grid of strata,
 * then place one random point per stratum).
 */
function generateStratifiedPoints(
  boundary: FeatureCollection,
  numPoints: number
): SamplingPoint[] {
  const { polygons, minLat, maxLat, minLng, maxLng } = extractBoundaryInfo(boundary)
  if (polygons.length === 0) return []

  const aspect = (maxLng - minLng) / (maxLat - minLat)
  const rows = Math.max(1, Math.round(Math.sqrt(numPoints / aspect)))
  const cols = Math.max(1, Math.round(numPoints / rows))

  const latStep = (maxLat - minLat) / rows
  const lngStep = (maxLng - minLng) / cols

  const points: SamplingPoint[] = []
  let idx = 1

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellMinLat = minLat + r * latStep
      const cellMinLng = minLng + c * lngStep

      // Try random point within this cell
      let found = false
      for (let attempt = 0; attempt < 50; attempt++) {
        const lat = cellMinLat + Math.random() * latStep
        const lng = cellMinLng + Math.random() * lngStep

        const inside = polygons.some((poly) => pointInPolygon(lat, lng, poly))
        if (inside) {
          points.push({
            lat: Math.round(lat * 1e6) / 1e6,
            lng: Math.round(lng * 1e6) / 1e6,
            label: `ST${idx}`,
          })
          idx++
          found = true
          break
        }
      }
      // Skip strata that fall outside the boundary
      if (!found) continue
    }
  }

  return points
}

/**
 * Generate stratified random points using hectare-based strata.
 * Each stratum covers approximately `haPerSample` hectares.
 */
function generateStratifiedPointsByDensity(
  boundary: FeatureCollection,
  haPerSample: number
): SamplingPoint[] {
  const { polygons, minLat, maxLat, minLng, maxLng } = extractBoundaryInfo(boundary)
  if (polygons.length === 0) return []

  const centerLat = (minLat + maxLat) / 2
  const { latStep, lngStep } = haToGridSpacing(haPerSample, centerLat)

  const points: SamplingPoint[] = []
  let idx = 1

  let cellMinLat = minLat
  while (cellMinLat + latStep <= maxLat + latStep / 2) {
    let cellMinLng = minLng
    while (cellMinLng + lngStep <= maxLng + lngStep / 2) {
      let found = false
      for (let attempt = 0; attempt < 50; attempt++) {
        const lat = cellMinLat + Math.random() * latStep
        const lng = cellMinLng + Math.random() * lngStep

        const inside = polygons.some((poly) => pointInPolygon(lat, lng, poly))
        if (inside) {
          points.push({
            lat: Math.round(lat * 1e6) / 1e6,
            lng: Math.round(lng * 1e6) / 1e6,
            label: `ST${idx}`,
          })
          idx++
          found = true
          break
        }
      }
      if (!found) { /* skip strata outside boundary */ }
      cellMinLng += lngStep
    }
    cellMinLat += latStep
  }

  return points
}

export default function SamplingPlanPanel({
  fieldId,
  boundary,
  areaHa,
  samplingPlans,
}: SamplingPlanPanelProps) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [strategy, setStrategy] = useState<'random' | 'grid' | 'stratified'>('random')
  const [inputMode, setInputMode] = useState<InputMode>('count')
  const [numPoints, setNumPoints] = useState(10)
  const [spacingHa, setSpacingHa] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewPoints, setPreviewPoints] = useState<SamplingPoint[] | null>(null)

  // Editing state for existing plans
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [editedPoints, setEditedPoints] = useState<SamplingPoint[] | null>(null)
  const [editModified, setEditModified] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editStatusMsg, setEditStatusMsg] = useState<string | null>(null)

  const hasBoundary = boundary?.features && boundary.features.length > 0

  // Calculate estimated point count from density
  const estimatedCountFromDensity =
    areaHa && spacingHa > 0 ? Math.max(1, Math.round(areaHa / spacingHa)) : null

  function generatePreview() {
    if (!boundary || !hasBoundary) return

    let points: SamplingPoint[]

    if (inputMode === 'density' && spacingHa > 0) {
      // Density mode: use ha-based spacing for grid/stratified,
      // or derive count from field area for random
      switch (strategy) {
        case 'random': {
          const count = estimatedCountFromDensity || 10
          points = generateRandomPoints(boundary, Math.min(count, 500))
          break
        }
        case 'grid':
          points = generateGridPointsByDensity(boundary, spacingHa)
          break
        case 'stratified':
          points = generateStratifiedPointsByDensity(boundary, spacingHa)
          break
      }
    } else {
      // Count mode: existing behaviour
      switch (strategy) {
        case 'random':
          points = generateRandomPoints(boundary, numPoints)
          break
        case 'grid':
          points = generateGridPoints(boundary, numPoints)
          break
        case 'stratified':
          points = generateStratifiedPoints(boundary, numPoints)
          break
      }
    }

    // Safety cap at 500
    if (points.length > 500) {
      points = points.slice(0, 500)
    }

    setPreviewPoints(points)
  }

  function regenerate() {
    generatePreview()
  }

  async function savePlan() {
    if (!previewPoints || previewPoints.length === 0) return
    if (!name.trim()) {
      setError('Plan name is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/fields/${fieldId}/sampling-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          strategy,
          num_points: previewPoints.length,
          points: previewPoints,
          spacing_ha: inputMode === 'density' ? spacingHa : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save plan')
      }

      setShowCreate(false)
      setName('')
      setPreviewPoints(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function deletePlan(planId: string) {
    if (!confirm('Delete this sampling plan?')) return

    try {
      const res = await fetch(
        `/api/fields/${fieldId}/sampling-plans?plan_id=${planId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to delete')
      if (editingPlanId === planId) {
        setEditingPlanId(null)
        setEditedPoints(null)
        setEditModified(false)
      }
      router.refresh()
    } catch {
      // silent
    }
  }

  function exportCSV(plan: { name: string; points: SamplingPoint[] }) {
    const header = 'label,latitude,longitude\n'
    const rows = plan.points.map((p) => `${p.label},${p.lat},${p.lng}`).join('\n')
    const csv = header + rows

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${plan.name.replace(/\s+/g, '_')}_sampling_plan.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function startEditing(plan: SamplingPlan) {
    setEditingPlanId(plan.id)
    setEditedPoints([...plan.points])
    setEditModified(false)
    setEditStatusMsg(null)
    // Close create form if open
    setShowCreate(false)
    setPreviewPoints(null)
  }

  function cancelEditing() {
    setEditingPlanId(null)
    setEditedPoints(null)
    setEditModified(false)
    setEditStatusMsg(null)
  }

  function handleEditPointsChange(newPoints: SamplingPoint[]) {
    setEditedPoints(newPoints)
    setEditModified(true)
    setEditStatusMsg(null)
  }

  async function saveEditedPoints() {
    if (!editingPlanId || !editedPoints) return

    setEditSaving(true)
    setEditStatusMsg(null)

    try {
      const res = await fetch(`/api/fields/${fieldId}/sampling-plans`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: editingPlanId,
          points: editedPoints,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save points')
      }

      setEditModified(false)
      setEditStatusMsg('Points saved')
      setTimeout(() => setEditStatusMsg(null), 3000)
      router.refresh()
    } catch (err) {
      setEditStatusMsg(err instanceof Error ? err.message : 'Error saving points')
    } finally {
      setEditSaving(false)
    }
  }

  const editingPlan = editingPlanId
    ? samplingPlans.find((p) => p.id === editingPlanId) || null
    : null

  function formatPlanMeta(plan: SamplingPlan) {
    const parts = [`${plan.num_points} points`]
    if (plan.spacing_ha) {
      parts.push(`${plan.spacing_ha} ha/sample`)
    }
    parts.push(plan.strategy.toUpperCase())
    parts.push(new Date(plan.created_at).toLocaleDateString())
    return parts
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-brand-black">
          Sampling Plans ({samplingPlans.length})
        </h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setShowCreate(!showCreate)
            if (!showCreate) {
              cancelEditing()
            }
          }}
          disabled={!hasBoundary}
          title={!hasBoundary ? 'Set a field boundary first' : undefined}
        >
          <Plus size={13} />
          New Plan
        </Button>
      </div>

      {!hasBoundary && (
        <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-4">
          Define a field boundary first (on the Map tab) to generate sampling plans.
        </p>
      )}

      {showCreate && hasBoundary && (
        <div className="mb-4 p-4 bg-brand-grey-3 rounded-lg space-y-3">
          {error && (
            <div className="text-xs text-red-600">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-brand-grey-1 mb-1">
              Plan Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Baseline Soil Sampling 2024"
              className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-brand-grey-1 mb-1">
                Strategy
              </label>
              <select
                value={strategy}
                onChange={(e) => {
                  setStrategy(e.target.value as typeof strategy)
                  setPreviewPoints(null)
                }}
                className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
              >
                <option value="random">Random</option>
                <option value="grid">Grid (systematic)</option>
                <option value="stratified">Stratified Random</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-grey-1 mb-1">
                Input Mode
              </label>
              <select
                value={inputMode}
                onChange={(e) => {
                  setInputMode(e.target.value as InputMode)
                  setPreviewPoints(null)
                }}
                className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
              >
                <option value="count">Number of points</option>
                <option value="density">Density (ha per sample)</option>
              </select>
            </div>
          </div>

          {/* Count input */}
          {inputMode === 'count' && (
            <div>
              <label className="block text-xs font-medium text-brand-grey-1 mb-1">
                Number of Points
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={numPoints}
                onChange={(e) => {
                  setNumPoints(parseInt(e.target.value) || 10)
                  setPreviewPoints(null)
                }}
                className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
              />
            </div>
          )}

          {/* Density input */}
          {inputMode === 'density' && (
            <div>
              <label className="block text-xs font-medium text-brand-grey-1 mb-1">
                Hectares per Sample
              </label>
              <input
                type="number"
                min={0.1}
                max={1000}
                step={0.1}
                value={spacingHa}
                onChange={(e) => {
                  setSpacingHa(parseFloat(e.target.value) || 1)
                  setPreviewPoints(null)
                }}
                className="w-full border border-brand-grey-2 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-meta-blue/30"
              />
              {areaHa != null && spacingHa > 0 && (
                <p className="text-xs text-brand-grey-1 mt-1">
                  Field area: {areaHa} ha &mdash; ~{estimatedCountFromDensity} sample{estimatedCountFromDensity !== 1 ? 's' : ''} at {spacingHa} ha/sample
                  {strategy === 'grid' || strategy === 'stratified' ? (
                    <> (grid cell ~{Math.round(Math.sqrt(spacingHa * 10000))} m &times; {Math.round(Math.sqrt(spacingHa * 10000))} m)</>
                  ) : null}
                </p>
              )}
              {!areaHa && (
                <p className="text-xs text-amber-600 mt-1">
                  Field area not set. The density will be applied using the boundary bounding box.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={generatePreview}>
              <Grid3X3 size={13} />
              Generate Points
            </Button>
            {previewPoints && (
              <>
                <Button size="sm" variant="ghost" onClick={regenerate}>
                  Re-randomize
                </Button>
                <Button size="sm" onClick={savePlan} disabled={saving}>
                  {saving ? 'Saving...' : `Save (${previewPoints.length} pts)`}
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setPreviewPoints(null) }}>
              Cancel
            </Button>
          </div>

          {previewPoints && (
            <div className="mt-2 space-y-3">
              <p className="text-xs text-brand-grey-1">
                Generated {previewPoints.length} sample points ({strategy}
                {inputMode === 'density' ? `, ${spacingHa} ha/sample` : ''}).
                Drag points on the map to adjust positions before saving.
              </p>
              <SamplingPlanMapWrapper
                boundary={boundary}
                points={previewPoints}
                onPointsChange={setPreviewPoints}
              />
              <div className="max-h-40 overflow-y-auto text-xs font-mono bg-white rounded border border-brand-grey-2 p-2">
                <table className="w-full">
                  <thead>
                    <tr className="text-brand-grey-1">
                      <th className="text-left pr-4">Label</th>
                      <th className="text-left pr-4">Lat</th>
                      <th className="text-left">Lng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewPoints.map((p, i) => (
                      <tr key={i}>
                        <td className="pr-4">{p.label}</td>
                        <td className="pr-4">{p.lat}</td>
                        <td>{p.lng}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit map for existing plan */}
      {editingPlan && editedPoints && hasBoundary && (
        <div className="mb-4 p-4 bg-purple-50 rounded-lg space-y-3 border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-brand-black">
                Editing: {editingPlan.name}
              </span>
              <span className="text-xs text-brand-grey-1 ml-2">
                Drag points to reposition them
              </span>
            </div>
            <div className="flex items-center gap-2">
              {editModified && (
                <Button size="sm" onClick={saveEditedPoints} disabled={editSaving}>
                  <Save size={13} />
                  {editSaving ? 'Saving...' : 'Save Points'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={cancelEditing}>
                <X size={13} />
                Close
              </Button>
              {editStatusMsg && (
                <span className={`text-xs ${editStatusMsg.toLowerCase().includes('error') ? 'text-red-600' : 'text-green-600'}`}>
                  {editStatusMsg}
                </span>
              )}
            </div>
          </div>
          <SamplingPlanMapWrapper
            boundary={boundary}
            points={editedPoints}
            onPointsChange={handleEditPointsChange}
          />
          <div className="max-h-32 overflow-y-auto text-xs font-mono bg-white rounded border border-brand-grey-2 p-2">
            <table className="w-full">
              <thead>
                <tr className="text-brand-grey-1">
                  <th className="text-left pr-4">Label</th>
                  <th className="text-left pr-4">Lat</th>
                  <th className="text-left">Lng</th>
                </tr>
              </thead>
              <tbody>
                {editedPoints.map((p, i) => (
                  <tr key={i}>
                    <td className="pr-4">{p.label}</td>
                    <td className="pr-4">{p.lat}</td>
                    <td>{p.lng}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {samplingPlans.length === 0 && !showCreate ? (
        <p className="text-sm text-brand-grey-1 text-center py-4">
          No sampling plans yet.
        </p>
      ) : (
        <div className="space-y-2">
          {samplingPlans.map((plan) => (
            <div
              key={plan.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                editingPlanId === plan.id
                  ? 'border-purple-400 bg-purple-50'
                  : 'border-brand-grey-2'
              }`}
            >
              <div>
                <span className="text-sm font-medium text-brand-black">{plan.name}</span>
                <div className="flex items-center gap-3 text-xs text-brand-grey-1 mt-0.5">
                  {formatPlanMeta(plan).map((part, i) => (
                    <span key={i}>{part}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {hasBoundary && (
                  <button
                    onClick={() => {
                      if (editingPlanId === plan.id) {
                        cancelEditing()
                      } else {
                        startEditing(plan)
                      }
                    }}
                    className={`transition-colors p-1 ${
                      editingPlanId === plan.id
                        ? 'text-purple-600 hover:text-purple-800'
                        : 'text-brand-grey-1 hover:text-brand-black'
                    }`}
                    title={editingPlanId === plan.id ? 'Close editor' : 'Edit points on map'}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  onClick={() => exportCSV(plan)}
                  className="text-brand-grey-1 hover:text-brand-black transition-colors p-1"
                  title="Export as CSV"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => deletePlan(plan.id)}
                  className="text-brand-grey-1 hover:text-red-500 transition-colors p-1"
                  title="Delete plan"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
