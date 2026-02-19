'use client'

import { useState, useCallback } from 'react'
import { MapPin, CloudRain } from 'lucide-react'
import {
  DAILY_VARIABLES,
  HOURLY_VARIABLES,
  DAILY_GROUPS,
  HOURLY_GROUPS,
  type WeatherResponse,
  type WeatherVariable,
} from '@/lib/weather'
import WeatherChart from './WeatherChart'
import WeatherTable from './WeatherTable'

interface WeatherTabProps {
  latitude: number | null
  longitude: number | null
  defaultStartDate?: string | null
  defaultEndDate?: string | null
  locationLabel?: string | null
}

function defaultDateRange(start?: string | null, end?: string | null): [string, string] {
  if (start && end) return [start, end]
  const now = new Date()
  const endStr = now.toISOString().slice(0, 10)
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const startStr = oneYearAgo.toISOString().slice(0, 10)
  return [start || startStr, end || endStr]
}

export default function WeatherTab({
  latitude,
  longitude,
  defaultStartDate,
  defaultEndDate,
  locationLabel,
}: WeatherTabProps) {
  const [dates, setDates] = useState(() => defaultDateRange(defaultStartDate, defaultEndDate))
  const [frequency, setFrequency] = useState<'daily' | 'hourly'>('daily')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => {
    // Default: temperature + precipitation + ET0
    return new Set([
      'temperature_2m_max',
      'temperature_2m_min',
      'temperature_2m_mean',
      'precipitation_sum',
      'et0_fao_evapotranspiration',
    ])
  })
  const [result, setResult] = useState<WeatherResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const groups = frequency === 'daily' ? DAILY_GROUPS : HOURLY_GROUPS
  const allVars = frequency === 'daily' ? DAILY_VARIABLES : HOURLY_VARIABLES

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleFrequencyChange = useCallback((f: 'daily' | 'hourly') => {
    setFrequency(f)
    // Reset selections to defaults for the new frequency
    if (f === 'daily') {
      setSelectedKeys(new Set([
        'temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean',
        'precipitation_sum', 'et0_fao_evapotranspiration',
      ]))
    } else {
      setSelectedKeys(new Set([
        'temperature_2m', 'precipitation', 'et0_fao_evapotranspiration',
      ]))
    }
    setResult(null)
  }, [])

  async function fetchWeather() {
    if (!latitude || !longitude) return
    setLoading(true)
    setError(null)

    const activeKeys = Array.from(selectedKeys).filter((k) =>
      allVars.some((v) => v.key === k)
    )
    if (activeKeys.length === 0) {
      setError('Select at least one weather parameter.')
      setLoading(false)
      return
    }

    try {
      const params = new URLSearchParams({
        lat: latitude.toString(),
        lon: longitude.toString(),
        start_date: dates[0],
        end_date: dates[1],
        frequency,
        variables: activeKeys.join(','),
      })
      const resp = await fetch(`/api/weather?${params.toString()}`)
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || `Request failed (${resp.status})`)
      }
      const data: WeatherResponse = await resp.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather data')
    } finally {
      setLoading(false)
    }
  }

  // No coordinates available
  if (latitude == null || longitude == null) {
    return (
      <div className="card text-center py-12">
        <CloudRain size={40} className="mx-auto text-brand-grey-1 mb-3" />
        <p className="text-brand-grey-1">
          No GPS coordinates available for this {locationLabel ? 'location' : 'trial/field'}.
          Add GPS data to view weather information.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="signpost-label">WEATHER DATA</p>
          <span className="flex items-center gap-1.5 text-sm text-brand-grey-1 font-mono">
            <MapPin size={14} />
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        </div>

        {/* Date range + frequency */}
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <label className="block text-xs text-brand-grey-1 mb-1">Start date</label>
            <input
              type="date"
              value={dates[0]}
              onChange={(e) => setDates([e.target.value, dates[1]])}
              className="border border-brand-grey-2 rounded px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-brand-grey-1 mb-1">End date</label>
            <input
              type="date"
              value={dates[1]}
              onChange={(e) => setDates([dates[0], e.target.value])}
              className="border border-brand-grey-2 rounded px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-brand-grey-1 mb-1">Frequency</label>
            <div className="flex rounded border border-brand-grey-2 overflow-hidden">
              {(['daily', 'hourly'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => handleFrequencyChange(f)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    frequency === f
                      ? 'bg-brand-black text-white'
                      : 'bg-white text-brand-grey-1 hover:text-brand-black'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Parameter checkboxes */}
        <div className="mb-4">
          <p className="text-xs text-brand-grey-1 mb-2">Parameters</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-medium text-brand-grey-1 mb-1">{group.label}</p>
                {group.keys.map((key) => {
                  const v = allVars.find((vr) => vr.key === key)
                  if (!v) return null
                  return (
                    <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer py-0.5">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(key)}
                        onChange={() => toggleKey(key)}
                        className="rounded border-brand-grey-2"
                      />
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: v.color }}
                      />
                      {v.label}
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Fetch button */}
        <div className="flex items-center gap-3">
          <button
            onClick={fetchWeather}
            disabled={loading}
            className="px-4 py-2 bg-brand-black text-white text-sm font-medium rounded hover:bg-opacity-90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Fetching...' : 'Fetch Weather Data'}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="card">
          <div className="animate-pulse space-y-4">
            <div className="h-[400px] bg-brand-grey-3 rounded" />
            <div className="h-4 bg-brand-grey-3 rounded w-1/3" />
            <div className="h-4 bg-brand-grey-3 rounded w-2/3" />
            <div className="h-4 bg-brand-grey-3 rounded w-1/2" />
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          <div className="card">
            <p className="signpost-label mb-3">CHART</p>
            <WeatherChart
              data={result.data}
              variables={result.variables}
              frequency={result.frequency}
            />
          </div>
          <div className="card">
            <p className="signpost-label mb-3">DATA</p>
            <WeatherTable
              data={result.data}
              variables={result.variables}
              frequency={result.frequency}
            />
          </div>
        </>
      )}
    </div>
  )
}
