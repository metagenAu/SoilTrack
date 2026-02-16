'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Trial } from './AnalyticsDashboard'

// Dynamically import the map to avoid SSR issues with Leaflet
const TrialMap = dynamic(() => import('./TrialMap'), { ssr: false })

// Consistent crop colors
const CROP_COLORS: Record<string, string> = {
  Wheat: '#E2A308',
  Barley: '#D97706',
  Canola: '#FACC15',
  Cotton: '#8B5CF6',
  Sorghum: '#EF4444',
  Chickpea: '#22C55E',
  Lentil: '#14B8A6',
  Faba: '#06B6D4',
  Sugarcane: '#10B981',
  Rice: '#6366F1',
  Maize: '#F59E0B',
  Oat: '#A3E635',
}

const FALLBACK_COLOR = '#008BCE'

function getCropColor(crop: string | null): string {
  if (!crop) return '#B9BCBF'
  return CROP_COLORS[crop] || FALLBACK_COLOR
}

interface ParsedTrial extends Trial {
  lat: number
  lng: number
}

function parseGps(gps: string): { lat: number; lng: number } | null {
  if (!gps) return null
  // Handle formats like "-33.45, 149.12" or "-33.45,149.12"
  const parts = gps.split(',').map((s) => s.trim())
  if (parts.length !== 2) return null
  const lat = parseFloat(parts[0])
  const lng = parseFloat(parts[1])
  if (isNaN(lat) || isNaN(lng)) return null
  // Basic bounds check for Australia
  if (lat < -45 || lat > -10 || lng < 110 || lng > 155) return null
  return { lat, lng }
}

export default function MapTab({ trials }: { trials: Trial[] }) {
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null)

  const mappableTrials: ParsedTrial[] = useMemo(() => {
    return trials
      .map((t) => {
        const coords = parseGps(t.gps || '')
        if (!coords) return null
        return { ...t, lat: coords.lat, lng: coords.lng }
      })
      .filter((t): t is ParsedTrial => t !== null)
  }, [trials])

  const filteredTrials = useMemo(() => {
    if (!selectedCrop) return mappableTrials
    return mappableTrials.filter((t) => t.crop === selectedCrop)
  }, [mappableTrials, selectedCrop])

  const crops = useMemo(() => {
    const cropSet = new Set<string>()
    for (const t of mappableTrials) {
      if (t.crop) cropSet.add(t.crop)
    }
    return Array.from(cropSet).sort()
  }, [mappableTrials])

  const unmappableCount = trials.length - mappableTrials.length

  return (
    <div>
      {/* Legend / filter */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="signpost-label">FILTER BY CROP</p>
          <div className="flex items-center gap-3 text-xs text-brand-grey-1">
            <span className="flex items-center gap-1">
              <MapPin size={12} />
              {mappableTrials.length} mapped
            </span>
            {unmappableCount > 0 && (
              <span>{unmappableCount} without GPS</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCrop(null)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              selectedCrop === null
                ? 'bg-meta-blue text-white'
                : 'bg-brand-grey-3 text-brand-black/70 hover:bg-brand-grey-2'
            )}
          >
            All Crops ({mappableTrials.length})
          </button>
          {crops.map((crop) => {
            const count = mappableTrials.filter((t) => t.crop === crop).length
            return (
              <button
                key={crop}
                onClick={() =>
                  setSelectedCrop(selectedCrop === crop ? null : crop)
                }
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  selectedCrop === crop
                    ? 'text-white'
                    : 'bg-brand-grey-3 text-brand-black/70 hover:bg-brand-grey-2'
                )}
                style={
                  selectedCrop === crop
                    ? { backgroundColor: getCropColor(crop) }
                    : undefined
                }
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getCropColor(crop) }}
                />
                {crop} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Map */}
      <div className="card p-0 overflow-hidden" style={{ height: '520px' }}>
        {mappableTrials.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-brand-grey-1">
            No trials with valid GPS coordinates found. Upload trial data with GPS to see them on the map.
          </div>
        ) : (
          <TrialMap trials={filteredTrials} getCropColor={getCropColor} />
        )}
      </div>
    </div>
  )
}
