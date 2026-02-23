'use client'

/**
 * ApplicationZoneAnalysis
 *
 * Computes convex hulls around each trial application zone, identifies which
 * data points (soil samples, chemistry, GIS layer features, custom layers)
 * fall inside each hull, then displays:
 *   - Summary statistics table per zone per metric
 *   - Scatter plots of application rate vs layer metric values with OLS regression
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, ComposedChart, Legend,
  BarChart, Bar, Cell, ErrorBar,
} from 'recharts'
import { BarChart3, TrendingUp, Table, ChevronDown, ChevronRight, Download } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import type { FeatureCollection } from 'geojson'
import type { TrialApplication } from '@/components/trials/TrialApplicationsPanel'
import {
  convexHullFromFC,
  extractPolygonRings,
  pointInPolygon,
  pointInAnyPolygon,
  computeStats,
  linearRegression,
  type ZoneStats,
  type RegressionResult,
} from '@/lib/geo-utils'

// ---------- Types ----------

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

interface GISLayer {
  id: string
  name: string
  geojson: FeatureCollection
}

interface CustomMapLayer {
  id: string
  name: string
  metric_columns: string[]
  points: { sample_no?: string; lat: number; lng: number; values: Record<string, number> }[]
}

interface DiscoveredMetric {
  key: string
  label: string
  source: 'raw_data' | 'chemistry' | 'custom' | 'gis'
  layerId?: string
  unit?: string
}

/** A data point with lat/lng and a set of metric values */
interface DataPoint {
  lat: number
  lng: number
  sampleNo?: string
  metricValues: Map<string, number>
}

interface ZoneResult {
  application: TrialApplication
  hullCoords: [number, number][]
  pointsInside: DataPoint[]
  statsByMetric: Map<string, ZoneStats>
}

interface Props {
  trialId: string
  applications: TrialApplication[]
  samples: SamplePoint[]
  soilChemistry: SoilChemistryRow[]
  gisLayers: GISLayer[]
  customLayers: CustomMapLayer[]
}

// ---------- Constants ----------

const ZONE_COLORS = [
  '#f59e0b', '#d97706', '#b45309', '#ea580c', '#c2410c',
  '#008BCE', '#00BB7E', '#006AC6', '#009775', '#004C97',
]

const METRIC_EXCLUDE = new Set([
  'trial_id', 'sample_no', 'sampleno', 'sample no', 'sample', 'sample id', 'sampleid',
  'date', 'sample_date', 'collection_date', 'sampling_date',
  'property', 'farm', 'site',
  'block', 'paddock', 'zone',
  'barcode', 'bar_code', 'bar code', 'sample barcode', 'sample_barcode',
  'latitude', 'lat', 'longitude', 'lng', 'lon', 'long',
  'id', 'created_at', 'raw_data',
])

// ---------- Metric discovery ----------

function discoverMetrics(
  samples: SamplePoint[],
  chemistry: SoilChemistryRow[],
  customLayers: CustomMapLayer[],
  gisLayers: GISLayer[]
): DiscoveredMetric[] {
  const metrics: DiscoveredMetric[] = []
  const seen = new Set<string>()

  // raw_data JSONB
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

  // soil_chemistry
  const chemMetrics = new Map<string, string | null>()
  for (const row of chemistry) {
    if (!chemMetrics.has(row.metric)) chemMetrics.set(row.metric, row.unit)
  }
  for (const [metric, unit] of chemMetrics) {
    const lower = metric.toLowerCase().trim()
    if (seen.has(lower)) continue
    seen.add(lower)
    metrics.push({ key: metric, label: metric, source: 'chemistry', unit: unit ?? undefined })
  }

  // custom layers
  for (const layer of customLayers) {
    for (const col of layer.metric_columns) {
      metrics.push({
        key: `custom:${layer.id}:${col}`,
        label: `${col} (${layer.name})`,
        source: 'custom',
        layerId: layer.id,
      })
    }
  }

  // GIS layer feature properties
  for (const layer of gisLayers) {
    const sampleSize = Math.min(layer.geojson.features.length, 100)
    if (sampleSize === 0) continue
    const counts = new Map<string, number>()
    for (let i = 0; i < sampleSize; i++) {
      const props = layer.geojson.features[i]?.properties
      if (!props) continue
      for (const [key, val] of Object.entries(props)) {
        if (METRIC_EXCLUDE.has(key.toLowerCase().trim())) continue
        if (val != null && val !== '' && !isNaN(Number(val))) {
          counts.set(key, (counts.get(key) || 0) + 1)
        }
      }
    }
    const threshold = Math.max(1, sampleSize * 0.5)
    for (const [key, count] of counts) {
      if (count >= threshold) {
        metrics.push({
          key: `gis:${layer.id}:${key}`,
          label: `${key} (${layer.name})`,
          source: 'gis',
          layerId: layer.id,
        })
      }
    }
  }

  return metrics.sort((a, b) => a.label.localeCompare(b.label))
}

// ---------- Build data points with all metric values ----------

function buildDataPoints(
  samples: SamplePoint[],
  chemistry: SoilChemistryRow[],
  customLayers: CustomMapLayer[],
  gisLayers: GISLayer[],
  metrics: DiscoveredMetric[]
): DataPoint[] {
  const points: DataPoint[] = []

  // Index chemistry by sample_no
  const chemBySample = new Map<string, Map<string, number>>()
  for (const row of chemistry) {
    if (row.value == null) continue
    if (!chemBySample.has(row.sample_no)) chemBySample.set(row.sample_no, new Map())
    chemBySample.get(row.sample_no)!.set(row.metric, row.value)
  }

  // Points from soil samples (raw_data + chemistry metrics)
  for (const s of samples) {
    if (s.latitude == null || s.longitude == null) continue
    const mv = new Map<string, number>()

    for (const m of metrics) {
      if (m.source === 'raw_data' && s.raw_data) {
        const val = s.raw_data[m.key]
        if (val != null && !isNaN(Number(val))) mv.set(m.key, Number(val))
      }
      if (m.source === 'chemistry') {
        const sampleMetrics = chemBySample.get(s.sample_no)
        if (sampleMetrics?.has(m.key)) mv.set(m.key, sampleMetrics.get(m.key)!)
      }
    }

    if (mv.size > 0) {
      points.push({ lat: s.latitude, lng: s.longitude, sampleNo: s.sample_no, metricValues: mv })
    }
  }

  // Points from custom map layers
  for (const layer of customLayers) {
    for (const pt of layer.points) {
      const mv = new Map<string, number>()
      for (const col of layer.metric_columns) {
        const compositeKey = `custom:${layer.id}:${col}`
        if (pt.values[col] != null) mv.set(compositeKey, pt.values[col])
      }
      if (mv.size > 0) {
        points.push({ lat: pt.lat, lng: pt.lng, sampleNo: pt.sample_no, metricValues: mv })
      }
    }
  }

  // Points from GIS layers (point features)
  for (const layer of gisLayers) {
    for (const f of layer.geojson.features) {
      if (!f.geometry || !f.properties) continue
      let lat: number | null = null
      let lng: number | null = null
      if (f.geometry.type === 'Point') {
        lng = f.geometry.coordinates[0]
        lat = f.geometry.coordinates[1]
      } else if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
        // Use centroid of polygon
        const coords = f.geometry.type === 'Polygon'
          ? f.geometry.coordinates[0]
          : f.geometry.coordinates[0]?.[0]
        if (coords && coords.length > 0) {
          let sumLng = 0, sumLat = 0
          for (const c of coords) { sumLng += c[0]; sumLat += c[1] }
          lng = sumLng / coords.length
          lat = sumLat / coords.length
        }
      }
      if (lat == null || lng == null) continue

      const mv = new Map<string, number>()
      for (const [key, val] of Object.entries(f.properties)) {
        const compositeKey = `gis:${layer.id}:${key}`
        if (val != null && val !== '' && !isNaN(Number(val))) {
          mv.set(compositeKey, Number(val))
        }
      }
      if (mv.size > 0) {
        points.push({ lat, lng, metricValues: mv })
      }
    }
  }

  return points
}

// ---------- Analyse zones ----------

function analyseZones(
  applications: TrialApplication[],
  dataPoints: DataPoint[],
  metrics: DiscoveredMetric[]
): ZoneResult[] {
  const results: ZoneResult[] = []

  for (const app of applications) {
    if (!app.geojson?.features?.length) continue

    // Try polygon containment first, fall back to convex hull
    const polygonRings = extractPolygonRings(app.geojson)
    const hullCoords = convexHullFromFC(app.geojson)

    // Use polygon rings for containment if available, else convex hull
    const testRings = polygonRings.length > 0 ? polygonRings : hullCoords.length >= 3 ? [hullCoords] : []

    if (testRings.length === 0) continue

    // Find points inside this zone
    const pointsInside: DataPoint[] = []
    for (const pt of dataPoints) {
      const lngLat: [number, number] = [pt.lng, pt.lat]
      if (pointInAnyPolygon(lngLat, testRings)) {
        pointsInside.push(pt)
      }
    }

    // Compute stats per metric
    const statsByMetric = new Map<string, ZoneStats>()
    for (const m of metrics) {
      const values = pointsInside
        .map(pt => pt.metricValues.get(m.key))
        .filter((v): v is number => v != null)
      if (values.length > 0) {
        statsByMetric.set(m.key, computeStats(values))
      }
    }

    results.push({
      application: app,
      hullCoords,
      pointsInside,
      statsByMetric,
    })
  }

  return results
}

// ---------- CSV export ----------

function exportStatsCSV(results: ZoneResult[], metrics: DiscoveredMetric[]) {
  const headers = ['Zone', 'Product', 'Rate', 'Type', 'Metric', 'n', 'Mean', 'StdDev', 'StdError', 'Min', 'Q1', 'Median', 'Q3', 'Max']
  const rows: string[][] = []

  for (const zone of results) {
    for (const m of metrics) {
      const stats = zone.statsByMetric.get(m.key)
      if (!stats) continue
      rows.push([
        zone.application.name,
        zone.application.product || '',
        zone.application.rate || '',
        zone.application.application_type || '',
        m.label,
        String(stats.n),
        stats.mean.toFixed(4),
        stats.stdDev.toFixed(4),
        stats.stdError.toFixed(4),
        stats.min.toFixed(4),
        stats.q1.toFixed(4),
        stats.median.toFixed(4),
        stats.q3.toFixed(4),
        stats.max.toFixed(4),
      ])
    }
  }

  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'zone_statistics.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- Sub-components ----------

function StatsTable({ results, metrics, selectedMetric }: {
  results: ZoneResult[]
  metrics: DiscoveredMetric[]
  selectedMetric: string | null
}) {
  const metricsToShow = selectedMetric
    ? metrics.filter(m => m.key === selectedMetric)
    : metrics.filter(m => results.some(r => r.statsByMetric.has(m.key)))

  if (metricsToShow.length === 0) {
    return <p className="text-sm text-brand-grey-1 py-4">No data points found inside any application zone.</p>
  }

  return (
    <div className="overflow-x-auto">
      {metricsToShow.map(m => {
        const zonesWithData = results.filter(r => r.statsByMetric.has(m.key))
        if (zonesWithData.length === 0) return null
        return (
          <div key={m.key} className="mb-6">
            <p className="text-sm font-semibold text-brand-black mb-2">
              {m.label}{m.unit ? ` (${m.unit})` : ''}
            </p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-brand-grey-2">
                  <th className="text-left py-2 pr-4 text-brand-grey-1 font-medium">Zone</th>
                  <th className="text-right py-2 px-3 text-brand-grey-1 font-medium">n</th>
                  <th className="text-right py-2 px-3 text-brand-grey-1 font-medium">Mean</th>
                  <th className="text-right py-2 px-3 text-brand-grey-1 font-medium">StdDev</th>
                  <th className="text-right py-2 px-3 text-brand-grey-1 font-medium">SE</th>
                  <th className="text-right py-2 px-3 text-brand-grey-1 font-medium">Min</th>
                  <th className="text-right py-2 px-3 text-brand-grey-1 font-medium">Q1</th>
                  <th className="text-right py-2 px-3 text-brand-grey-1 font-medium">Median</th>
                  <th className="text-right py-2 px-3 text-brand-grey-1 font-medium">Q3</th>
                  <th className="text-right py-2 px-3 text-brand-grey-1 font-medium">Max</th>
                </tr>
              </thead>
              <tbody>
                {zonesWithData.map((zone, idx) => {
                  const stats = zone.statsByMetric.get(m.key)!
                  return (
                    <tr key={zone.application.id} className="border-b border-brand-grey-3">
                      <td className="py-2 pr-4">
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                            style={{ backgroundColor: ZONE_COLORS[idx % ZONE_COLORS.length] }}
                          />
                          <span className="font-medium">{zone.application.name}</span>
                          {zone.application.rate && (
                            <span className="text-brand-grey-1 text-xs">({zone.application.rate})</span>
                          )}
                        </span>
                      </td>
                      <td className="text-right py-2 px-3 font-mono">{stats.n}</td>
                      <td className="text-right py-2 px-3 font-mono">{stats.mean.toFixed(2)}</td>
                      <td className="text-right py-2 px-3 font-mono">{stats.stdDev.toFixed(2)}</td>
                      <td className="text-right py-2 px-3 font-mono">{stats.stdError.toFixed(2)}</td>
                      <td className="text-right py-2 px-3 font-mono">{stats.min.toFixed(2)}</td>
                      <td className="text-right py-2 px-3 font-mono">{stats.q1.toFixed(2)}</td>
                      <td className="text-right py-2 px-3 font-mono">{stats.median.toFixed(2)}</td>
                      <td className="text-right py-2 px-3 font-mono">{stats.q3.toFixed(2)}</td>
                      <td className="text-right py-2 px-3 font-mono">{stats.max.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function BarChartByZone({ results, metricKey, metricLabel, metricUnit }: {
  results: ZoneResult[]
  metricKey: string
  metricLabel: string
  metricUnit?: string
}) {
  const data = results
    .filter(r => r.statsByMetric.has(metricKey))
    .map((r, idx) => {
      const stats = r.statsByMetric.get(metricKey)!
      return {
        name: r.application.name + (r.application.rate ? ` (${r.application.rate})` : ''),
        mean: parseFloat(stats.mean.toFixed(3)),
        errorBar: parseFloat(stats.stdError.toFixed(3)),
        n: stats.n,
        color: ZONE_COLORS[idx % ZONE_COLORS.length],
      }
    })

  if (data.length === 0) return null

  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-brand-black mb-2">
        {metricLabel}{metricUnit ? ` (${metricUnit})` : ''} — Mean +/- SE by Zone
      </p>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 15, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DCDDDF" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#161F28' }}
              tickLine={false}
              axisLine={{ stroke: '#DCDDDF' }}
              interval={0}
              angle={data.length > 4 ? -20 : 0}
              textAnchor={data.length > 4 ? 'end' : 'middle'}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#B9BCBF' }}
              tickLine={false}
              axisLine={false}
              label={{
                value: metricUnit || metricLabel,
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fill: '#B9BCBF' },
              }}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #DCDDDF',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
              formatter={(value: any, name: any) => {
                if (name === 'mean') return [Number(value).toFixed(3), 'Mean']
                return [value, name]
              }}
            />
            <Bar dataKey="mean" radius={[4, 4, 0, 0]} maxBarSize={60}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
              <ErrorBar dataKey="errorBar" width={8} strokeWidth={1.5} stroke="#161F28" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function RegressionPlot({ results, metricKey, metricLabel, metricUnit }: {
  results: ZoneResult[]
  metricKey: string
  metricLabel: string
  metricUnit?: string
}) {
  // Parse numeric rates from application zones
  const scatterData: { x: number; y: number; zone: string; color: string }[] = []
  const rateXs: number[] = []
  const metricYs: number[] = []

  for (let idx = 0; idx < results.length; idx++) {
    const zone = results[idx]
    const rateStr = zone.application.rate
    if (!rateStr) continue
    const rateNum = parseFloat(rateStr.replace(/[^0-9.\-]/g, ''))
    if (isNaN(rateNum)) continue

    const stats = zone.statsByMetric.get(metricKey)
    if (!stats) continue

    const color = ZONE_COLORS[idx % ZONE_COLORS.length]
    for (const v of stats.values) {
      scatterData.push({ x: rateNum, y: v, zone: zone.application.name, color })
      rateXs.push(rateNum)
      metricYs.push(v)
    }
  }

  const regression = useMemo(() => {
    if (rateXs.length < 2) return null
    return linearRegression(rateXs, metricYs)
  }, [rateXs, metricYs])

  if (scatterData.length < 2) return null

  // Build regression line endpoints
  const xMin = Math.min(...rateXs)
  const xMax = Math.max(...rateXs)
  const lineData = regression ? [
    { x: xMin, y: regression.intercept + regression.slope * xMin },
    { x: xMax, y: regression.intercept + regression.slope * xMax },
  ] : []

  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-brand-black mb-1">
        Application Rate vs {metricLabel}{metricUnit ? ` (${metricUnit})` : ''}
      </p>
      {regression && (
        <p className="text-xs text-brand-grey-1 mb-2">
          y = {regression.slope.toFixed(4)}x + {regression.intercept.toFixed(4)} | R&sup2; = {regression.rSquared.toFixed(4)} | n = {regression.n}
          {regression.pValue != null && (
            <> | p = {regression.pValue < 0.001 ? '<0.001' : regression.pValue.toFixed(4)}</>
          )}
        </p>
      )}
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer>
          <ComposedChart margin={{ top: 15, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DCDDDF" />
            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fontSize: 11, fill: '#161F28' }}
              tickLine={false}
              axisLine={{ stroke: '#DCDDDF' }}
              label={{
                value: 'Rate',
                position: 'insideBottom',
                offset: -10,
                style: { fontSize: 11, fill: '#B9BCBF' },
              }}
            />
            <YAxis
              dataKey="y"
              type="number"
              tick={{ fontSize: 11, fill: '#B9BCBF' }}
              tickLine={false}
              axisLine={false}
              label={{
                value: metricLabel + (metricUnit ? ` (${metricUnit})` : ''),
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fill: '#B9BCBF' },
              }}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #DCDDDF',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
              formatter={(value: any, name: any) => {
                if (name === 'y') return [Number(value).toFixed(3), metricLabel]
                return [Number(value).toFixed(3), 'Rate']
              }}
              labelFormatter={(label: any) => `Rate: ${label}`}
            />
            {/* Scatter points, coloured by zone */}
            <Scatter data={scatterData} fill="#008BCE" isAnimationActive={false}>
              {scatterData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Scatter>
            {/* Regression line */}
            {lineData.length === 2 && (
              <Scatter data={lineData} line={{ stroke: '#161F28', strokeWidth: 2, strokeDasharray: '6 3' }} fill="none" isAnimationActive={false} legendType="none" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------- Main Component ----------

export default function ApplicationZoneAnalysis({
  trialId,
  applications,
  samples,
  soilChemistry,
  gisLayers,
  customLayers,
}: Props) {
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
  const [view, setView] = useState<'table' | 'chart' | 'regression'>('table')

  // Discover all available metrics
  const metrics = useMemo(
    () => discoverMetrics(samples, soilChemistry, customLayers, gisLayers),
    [samples, soilChemistry, customLayers, gisLayers]
  )

  // Build data points with all metric values
  const dataPoints = useMemo(
    () => buildDataPoints(samples, soilChemistry, customLayers, gisLayers, metrics),
    [samples, soilChemistry, customLayers, gisLayers, metrics]
  )

  // Analyse each application zone
  const zoneResults = useMemo(
    () => analyseZones(applications, dataPoints, metrics),
    [applications, dataPoints, metrics]
  )

  // Metrics that have data in at least one zone
  const availableMetrics = useMemo(
    () => metrics.filter(m => zoneResults.some(r => r.statsByMetric.has(m.key))),
    [metrics, zoneResults]
  )

  // Auto-select first metric
  useEffect(() => {
    if (!selectedMetric && availableMetrics.length > 0) {
      setSelectedMetric(availableMetrics[0].key)
    }
  }, [availableMetrics, selectedMetric])

  const currentMetric = metrics.find(m => m.key === selectedMetric)

  if (applications.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-brand-grey-1">
        No application zones defined. Add applications with spatial boundaries to run zone analysis.
      </div>
    )
  }

  if (dataPoints.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-brand-grey-1">
        No georeferenced data points available for zone analysis.
        Upload soil samples, chemistry data, or GIS layers with coordinates.
      </div>
    )
  }

  if (availableMetrics.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-brand-grey-1">
        No data points fall within any application zone convex hull.
        Check that sample locations overlap with application boundaries.
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="signpost-label">ZONE ANALYSIS</p>
          <p className="text-xs text-brand-grey-1 mt-1">
            {zoneResults.length} zone{zoneResults.length !== 1 ? 's' : ''} | {dataPoints.length} data point{dataPoints.length !== 1 ? 's' : ''} | {availableMetrics.length} metric{availableMetrics.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === 'table' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('table')}
          >
            <Table className="w-3.5 h-3.5" />
            Stats
          </Button>
          <Button
            variant={view === 'chart' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('chart')}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Chart
          </Button>
          <Button
            variant={view === 'regression' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setView('regression')}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Regression
          </Button>
          <Button variant="ghost" size="sm" onClick={() => exportStatsCSV(zoneResults, availableMetrics)}>
            <Download className="w-3.5 h-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* Metric selector */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-brand-grey-1 mb-1">Metric</label>
        <select
          className="w-full max-w-xs border border-brand-grey-2 rounded-lg px-3 py-2 text-sm bg-white"
          value={selectedMetric ?? ''}
          onChange={(e) => setSelectedMetric(e.target.value || null)}
        >
          <option value="">All metrics</option>
          {availableMetrics.map(m => (
            <option key={m.key} value={m.key}>
              {m.label}{m.unit ? ` (${m.unit})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Zone summary badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {zoneResults.map((zone, idx) => (
          <div
            key={zone.application.id}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-grey-2 bg-white text-xs"
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: ZONE_COLORS[idx % ZONE_COLORS.length] }}
            />
            <span className="font-medium">{zone.application.name}</span>
            <span className="text-brand-grey-1">
              {zone.pointsInside.length} pt{zone.pointsInside.length !== 1 ? 's' : ''}
            </span>
            {zone.application.rate && (
              <span className="text-brand-grey-1">| {zone.application.rate}</span>
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      {view === 'table' && (
        <StatsTable results={zoneResults} metrics={availableMetrics} selectedMetric={selectedMetric} />
      )}

      {view === 'chart' && (
        <>
          {selectedMetric && currentMetric ? (
            <BarChartByZone
              results={zoneResults}
              metricKey={selectedMetric}
              metricLabel={currentMetric.label}
              metricUnit={currentMetric.unit}
            />
          ) : (
            availableMetrics.slice(0, 10).map(m => (
              <BarChartByZone
                key={m.key}
                results={zoneResults}
                metricKey={m.key}
                metricLabel={m.label}
                metricUnit={m.unit}
              />
            ))
          )}
        </>
      )}

      {view === 'regression' && (
        <>
          {selectedMetric && currentMetric ? (
            <RegressionPlot
              results={zoneResults}
              metricKey={selectedMetric}
              metricLabel={currentMetric.label}
              metricUnit={currentMetric.unit}
            />
          ) : (
            availableMetrics.slice(0, 10).map(m => (
              <RegressionPlot
                key={m.key}
                results={zoneResults}
                metricKey={m.key}
                metricLabel={m.label}
                metricUnit={m.unit}
              />
            ))
          )}
          {!applications.some(a => a.rate && !isNaN(parseFloat(a.rate.replace(/[^0-9.\-]/g, '')))) && (
            <p className="text-sm text-brand-grey-1 py-4">
              No numeric application rates found. Add a numeric rate value to application zones to enable regression analysis.
            </p>
          )}
        </>
      )}
    </div>
  )
}
