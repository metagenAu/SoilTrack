'use client'

import { useMemo } from 'react'
import StatCard from '@/components/ui/StatCard'
import StatusPill from '@/components/ui/StatusPill'
import type { Trial } from './AnalyticsDashboard'

interface SummaryTabProps {
  trials: Trial[]
  totalClients: number
  totalSamples: number
}

export default function SummaryTab({
  trials,
  totalClients,
  totalSamples,
}: SummaryTabProps) {
  const stats = useMemo(() => {
    const active = trials.filter((t) => t.status === 'active')
    const completed = trials.filter((t) => t.status === 'completed')
    const paused = trials.filter((t) => t.status === 'paused')

    // Crops breakdown
    const cropCounts: Record<string, { total: number; active: number; completed: number }> = {}
    for (const t of trials) {
      const crop = t.crop || 'Unknown'
      if (!cropCounts[crop]) cropCounts[crop] = { total: 0, active: 0, completed: 0 }
      cropCounts[crop].total++
      if (t.status === 'active') cropCounts[crop].active++
      if (t.status === 'completed') cropCounts[crop].completed++
    }
    const crops = Object.entries(cropCounts)
      .sort(([, a], [, b]) => b.total - a.total)

    // Trials by year (from planting_date or created_at)
    const yearCounts: Record<string, { total: number; active: number; completed: number }> = {}
    for (const t of trials) {
      const dateStr = t.planting_date || t.created_at
      if (!dateStr) continue
      const year = new Date(dateStr).getFullYear().toString()
      if (!yearCounts[year]) yearCounts[year] = { total: 0, active: 0, completed: 0 }
      yearCounts[year].total++
      if (t.status === 'active') yearCounts[year].active++
      if (t.status === 'completed') yearCounts[year].completed++
    }
    const years = Object.entries(yearCounts).sort(([a], [b]) => b.localeCompare(a))

    // Trial types
    const typeCounts: Record<string, number> = {}
    for (const t of trials) {
      const type = t.trial_type || 'Unknown'
      typeCounts[type] = (typeCounts[type] || 0) + 1
    }
    const types = Object.entries(typeCounts).sort(([, a], [, b]) => b - a)

    // Locations
    const locationCounts: Record<string, number> = {}
    for (const t of trials) {
      const loc = t.location || 'Unknown'
      locationCounts[loc] = (locationCounts[loc] || 0) + 1
    }
    const locations = Object.entries(locationCounts).sort(([, a], [, b]) => b - a)

    return { active, completed, paused, crops, years, types, locations }
  }, [trials])

  const maxCropCount = Math.max(...stats.crops.map(([, c]) => c.total), 1)
  const maxYearCount = Math.max(...stats.years.map(([, c]) => c.total), 1)

  return (
    <div>
      {/* Top-level stat cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard label="TOTAL TRIALS" value={trials.length} borderColor="#004C97" />
        <StatCard label="ACTIVE" value={stats.active.length} borderColor="#00BB7E" />
        <StatCard label="COMPLETED" value={stats.completed.length} borderColor="#008BCE" />
        <StatCard label="SOIL SAMPLES" value={totalSamples} borderColor="#006AC6" />
        <StatCard label="CLIENTS" value={totalClients} borderColor="#009775" />
      </div>

      {/* Status overview bar */}
      {trials.length > 0 && (
        <div className="card mb-6">
          <p className="signpost-label mb-3">TRIAL STATUS</p>
          <div className="flex rounded-lg overflow-hidden h-8 mb-3">
            {stats.active.length > 0 && (
              <div
                className="bg-green-lush flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(stats.active.length / trials.length) * 100}%` }}
              >
                {stats.active.length}
              </div>
            )}
            {stats.completed.length > 0 && (
              <div
                className="bg-meta-blue flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(stats.completed.length / trials.length) * 100}%` }}
              >
                {stats.completed.length}
              </div>
            )}
            {stats.paused.length > 0 && (
              <div
                className="bg-[#e67e22] flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(stats.paused.length / trials.length) * 100}%` }}
              >
                {stats.paused.length}
              </div>
            )}
          </div>
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <StatusPill status="active" /> {stats.active.length} active
            </span>
            <span className="flex items-center gap-1.5">
              <StatusPill status="completed" /> {stats.completed.length} completed
            </span>
            {stats.paused.length > 0 && (
              <span className="flex items-center gap-1.5">
                <StatusPill status="paused" /> {stats.paused.length} paused
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Crops breakdown */}
        <div className="card">
          <p className="signpost-label mb-4">TRIALS BY CROP</p>
          {stats.crops.length === 0 ? (
            <p className="text-sm text-brand-grey-1">No crop data available</p>
          ) : (
            <div className="space-y-3">
              {stats.crops.map(([crop, counts]) => (
                <div key={crop}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{crop}</span>
                    <span className="text-brand-grey-1 text-xs">
                      {counts.total} trial{counts.total !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex rounded-full overflow-hidden h-5 bg-brand-grey-3">
                    {counts.active > 0 && (
                      <div
                        className="bg-green-lush flex items-center justify-center text-white text-[10px] font-medium"
                        style={{ width: `${(counts.active / maxCropCount) * 100}%` }}
                      >
                        {counts.active}
                      </div>
                    )}
                    {counts.completed > 0 && (
                      <div
                        className="bg-meta-blue flex items-center justify-center text-white text-[10px] font-medium"
                        style={{ width: `${(counts.completed / maxCropCount) * 100}%` }}
                      >
                        {counts.completed}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trials by year */}
        <div className="card">
          <p className="signpost-label mb-4">TRIALS BY YEAR</p>
          {stats.years.length === 0 ? (
            <p className="text-sm text-brand-grey-1">No date data available</p>
          ) : (
            <div className="space-y-3">
              {stats.years.map(([year, counts]) => (
                <div key={year}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium font-mono">{year}</span>
                    <span className="text-brand-grey-1 text-xs">
                      {counts.total} trial{counts.total !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex rounded-full overflow-hidden h-5 bg-brand-grey-3">
                    {counts.active > 0 && (
                      <div
                        className="bg-green-lush flex items-center justify-center text-white text-[10px] font-medium"
                        style={{ width: `${(counts.active / maxYearCount) * 100}%` }}
                      >
                        {counts.active}
                      </div>
                    )}
                    {counts.completed > 0 && (
                      <div
                        className="bg-meta-blue flex items-center justify-center text-white text-[10px] font-medium"
                        style={{ width: `${(counts.completed / maxYearCount) * 100}%` }}
                      >
                        {counts.completed}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trial types */}
        <div className="card">
          <p className="signpost-label mb-4">TRIAL TYPES</p>
          {stats.types.length === 0 ? (
            <p className="text-sm text-brand-grey-1">No trial type data available</p>
          ) : (
            <div className="space-y-2">
              {stats.types.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span>{type}</span>
                  <span className="font-mono font-medium text-meta-blue">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Locations */}
        <div className="card">
          <p className="signpost-label mb-4">TRIAL LOCATIONS</p>
          {stats.locations.length === 0 ? (
            <p className="text-sm text-brand-grey-1">No location data available</p>
          ) : (
            <div className="space-y-2">
              {stats.locations.map(([location, count]) => (
                <div key={location} className="flex items-center justify-between text-sm">
                  <span>{location}</span>
                  <span className="font-mono font-medium text-meta-blue">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
