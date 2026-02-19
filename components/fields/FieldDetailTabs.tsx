'use client'

import { useState } from 'react'
import { Map, FlaskConical, Grid3X3, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import FieldMapWrapper from './FieldMapWrapper'
import FieldTrialsPanel from './FieldTrialsPanel'
import FieldAnnotationsPanel from './FieldAnnotationsPanel'
import SamplingPlanPanel from './SamplingPlanPanel'
import FieldGISLayersPanel from './FieldGISLayersPanel'
import type { FeatureCollection } from 'geojson'

interface FieldDetailTabsProps {
  field: {
    id: string
    name: string
    area_ha: number | null
    boundary: FeatureCollection | null
    boundary_source: string | null
    [key: string]: unknown
  }
  fieldTrials: Array<{
    id: string
    field_id: string
    trial_id: string
    season: string | null
    notes: string | null
    trials: {
      id: string
      name: string
      crop: string | null
      status: string
      grower: string | null
      location: string | null
    }
  }>
  annotations: Array<{
    id: string
    field_id: string
    label: string
    annotation_type: string
    geojson: Record<string, unknown>
    style: Record<string, unknown> | null
    created_at: string
  }>
  samplingPlans: Array<{
    id: string
    field_id: string
    name: string
    strategy: string
    num_points: number
    spacing_ha: number | null
    points: Array<{ lat: number; lng: number; label: string }>
    created_at: string
  }>
  gisLayers: Array<{
    id: string
    field_id: string
    name: string
    file_type: string
    geojson: FeatureCollection
    feature_count: number
    style: Record<string, unknown> | null
    created_at: string
  }>
  allTrials: Array<{
    id: string
    name: string
    crop: string | null
    status: string
    grower: string | null
    location: string | null
  }>
  clients: Array<{ id: string; name: string; farm: string | null }>
}

const tabs = [
  { key: 'map', label: 'Map', icon: Map },
  { key: 'trials', label: 'Trials', icon: FlaskConical },
  { key: 'layers', label: 'GIS Layers', icon: Layers },
  { key: 'sampling', label: 'Sampling Plans', icon: Grid3X3 },
] as const

type TabKey = (typeof tabs)[number]['key']

export default function FieldDetailTabs({
  field,
  fieldTrials,
  annotations,
  samplingPlans,
  gisLayers,
  allTrials,
}: FieldDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('map')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-brand-grey-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab.key
                  ? 'border-meta-blue text-meta-blue'
                  : 'border-transparent text-brand-grey-1 hover:text-brand-black'
              )}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'map' && (
        <div className="space-y-4">
          <FieldMapWrapper
            fieldId={field.id}
            boundary={field.boundary}
            boundarySource={field.boundary_source}
            annotations={annotations}
            gisLayers={gisLayers}
            samplingPlans={samplingPlans}
          />
          <FieldAnnotationsPanel
            fieldId={field.id}
            annotations={annotations}
          />
        </div>
      )}

      {activeTab === 'trials' && (
        <FieldTrialsPanel
          fieldId={field.id}
          fieldTrials={fieldTrials}
          allTrials={allTrials}
        />
      )}

      {activeTab === 'layers' && (
        <FieldGISLayersPanel
          fieldId={field.id}
          gisLayers={gisLayers}
        />
      )}

      {activeTab === 'sampling' && (
        <SamplingPlanPanel
          fieldId={field.id}
          boundary={field.boundary}
          areaHa={field.area_ha}
          samplingPlans={samplingPlans}
        />
      )}
    </div>
  )
}
