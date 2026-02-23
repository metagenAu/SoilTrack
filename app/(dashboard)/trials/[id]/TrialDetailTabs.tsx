'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { cn, formatDate } from '@/lib/utils'
import TreatmentsTable from '@/components/trials/TreatmentsTable'
import SoilHealthTable from '@/components/trials/SoilHealthTable'
import PlotDataTable from '@/components/trials/PlotDataTable'
import ManagementLog from '@/components/trials/ManagementLog'
import MetadataTable from '@/components/trials/MetadataTable'
import PhotosTab from '@/components/trials/PhotosTab'
import TrialMap from '@/components/trials/TrialMapWrapper'
import StatCard from '@/components/ui/StatCard'
import EditableField from '@/components/trials/EditableField'
import TrialFieldsPanel from '@/components/trials/TrialFieldsPanel'
import TrialApplicationsPanel from '@/components/trials/TrialApplicationsPanel'
import type { TrialApplication } from '@/components/trials/TrialApplicationsPanel'
import ApplicationZoneAnalysis from '@/components/trials/ApplicationZoneAnalysis'
import WeatherTab from '@/components/weather/WeatherTab'
import { parseGPS } from '@/lib/weather'
import { createClient } from '@/lib/supabase/client'

interface TrialDetailTabsProps {
  trial: any
  treatments: any[]
  samples: any[]
  plots: any[]
  log: any[]
  dataCoverage: Record<string, boolean>
  metadataCount: number
  photosCount: number
  linkedFields?: any[]
  allFields?: any[]
  applications?: any[]
  supabaseUrl: string
}

const tabs = ['Summary', 'Treatments', 'Applications', 'Soil Health', 'Plot Data', 'Assay Results', 'Photos', 'Map', 'Weather', 'Fields', 'Management']

// Hook to lazily fetch data from Supabase when a tab is first opened
function useLazyTabData<T>(trialId: string, activeTab: string, triggerTab: string, fetcher: (supabase: any, trialId: string) => Promise<T>, initial?: T) {
  const [data, setData] = useState<T | undefined>(initial)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (activeTab !== triggerTab || loaded) return
    setLoading(true)
    setError(null)
    const supabase = createClient()
    fetcher(supabase, trialId)
      .then((result) => {
        setData(result)
        setLoaded(true)
      })
      .catch((err) => {
        setError(err?.message || 'Failed to load data')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [activeTab, triggerTab, trialId, loaded, fetcher])

  return { data, loading, error }
}

export default function TrialDetailTabs({
  trial,
  treatments,
  samples,
  plots,
  log,
  dataCoverage,
  metadataCount,
  photosCount,
  linkedFields = [],
  allFields = [],
  applications: initialApplications = [],
  supabaseUrl,
}: TrialDetailTabsProps) {
  const [activeTab, setActiveTab] = useState('Summary')
  const [applications, setApplications] = useState<TrialApplication[]>(initialApplications)
  const parsedGps = parseGPS(trial.gps)

  // Keep a stable ref to linkedFields so fetchMapData doesn't get a new identity on re-render
  const linkedFieldsRef = useRef(linkedFields)
  linkedFieldsRef.current = linkedFields

  // Lazy-load heavy tab data only when the user clicks the tab
  const fetchMetadata = useCallback(async (supabase: any, trialId: string) => {
    const { data } = await supabase.from('sample_metadata').select('*').eq('trial_id', trialId).order('sample_no')
    return data || []
  }, [])

  const fetchPhotos = useCallback(async (supabase: any, trialId: string) => {
    const { data } = await supabase.from('trial_photos').select('*').eq('trial_id', trialId).order('created_at', { ascending: false })
    return data || []
  }, [])

  // Fetch spatial data (chemistry, GIS layers) — used by both Map and Applications (zone analysis) tabs
  const fetchSpatialData = useCallback(async (supabase: any, trialId: string) => {
    const fieldIds = linkedFieldsRef.current.map((lf: any) => lf.field_id).filter(Boolean)
    const queries: Promise<any>[] = [
      supabase.from('soil_chemistry').select('*').eq('trial_id', trialId),
      supabase.from('trial_gis_layers').select('*').eq('trial_id', trialId).order('created_at'),
      supabase.from('custom_map_layers').select('*').eq('trial_id', trialId).order('created_at'),
    ]
    if (fieldIds.length > 0) {
      queries.push(supabase.from('field_gis_layers').select('*').in('field_id', fieldIds).order('created_at'))
    }
    const results = await Promise.all(queries)
    return {
      soilChemistry: results[0].data || [],
      gisLayers: results[1].data || [],
      customLayers: results[2].data || [],
      fieldGisLayers: fieldIds.length > 0 ? (results[3].data || []) : [],
    }
  }, [])

  const { data: metadata, loading: metadataLoading, error: metadataError } = useLazyTabData(trial.id, activeTab, 'Assay Results', fetchMetadata, [])
  const { data: photos, loading: photosLoading, error: photosError } = useLazyTabData(trial.id, activeTab, 'Photos', fetchPhotos, [])

  // Spatial data (chemistry, GIS layers) — shared by Map and Applications zone analysis.
  // Trigger fetch on whichever tab is visited first to avoid a double-fetch.
  const spatialTrigger = (activeTab === 'Map' || (activeTab === 'Applications' && applications.length > 0))
    ? 'spatialNeeded' : ''
  const { data: spatialData, loading: spatialLoading, error: spatialError } = useLazyTabData(
    trial.id, spatialTrigger, 'spatialNeeded', fetchSpatialData
  )
  // Aliases for downstream usage
  const mapData = spatialData
  const mapLoading = spatialLoading
  const mapError = spatialError
  const zoneAnalysisData = spatialData
  const zoneLoading = spatialLoading
  const zoneError = spatialError

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-brand-grey-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-brand-black text-brand-black'
                : 'border-transparent text-brand-grey-1 hover:text-brand-black'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Summary' && (
        <div className="grid grid-cols-2 gap-6">
          <div className="card">
            <p className="signpost-label mb-3">TRIAL DETAILS</p>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">Trial ID</dt>
                <dd className="font-mono font-medium">{trial.id}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">Grower</dt>
                <dd><EditableField trialId={trial.id} field="grower" value={trial.grower} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">Location</dt>
                <dd><EditableField trialId={trial.id} field="location" value={trial.location} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">GPS</dt>
                <dd><EditableField trialId={trial.id} field="gps" value={trial.gps} className="font-mono text-xs" /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">Crop</dt>
                <dd><EditableField trialId={trial.id} field="crop" value={trial.crop} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">Trial Type</dt>
                <dd><EditableField trialId={trial.id} field="trial_type" value={trial.trial_type} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">Contact</dt>
                <dd><EditableField trialId={trial.id} field="contact" value={trial.contact} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">Planting Date</dt>
                <dd><EditableField trialId={trial.id} field="planting_date" value={trial.planting_date} type="date" /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">Harvest Date</dt>
                <dd><EditableField trialId={trial.id} field="harvest_date" value={trial.harvest_date} type="date" /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">Treatments</dt>
                <dd><EditableField trialId={trial.id} field="num_treatments" value={trial.num_treatments} type="number" /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-brand-grey-1">Reps</dt>
                <dd><EditableField trialId={trial.id} field="reps" value={trial.reps} type="number" /></dd>
              </div>
            </dl>
          </div>

          <div className="space-y-4">
            <p className="signpost-label">DATA COVERAGE</p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="SOIL SAMPLES" value={samples.length} borderColor="#B9BCBF" />
              <StatCard label="TREATMENTS" value={treatments.length} borderColor="#DCDDDF" />
              <StatCard label="PLOT RECORDS" value={plots.length} borderColor="#B9BCBF" />
              <StatCard label="ASSAY RESULTS" value={metadataCount} borderColor="#DCDDDF" />
              <StatCard label="PHOTOS" value={photosCount} borderColor="#B9BCBF" />
              <StatCard label="LOG ENTRIES" value={log.length} borderColor="#DCDDDF" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Treatments' && (
        <div className="card">
          <TreatmentsTable treatments={treatments} />
        </div>
      )}

      {activeTab === 'Applications' && (
        <>
          <div className="card">
            <TrialApplicationsPanel
              trialId={trial.id}
              applications={applications}
              treatments={treatments}
              onApplicationsChange={setApplications}
            />
          </div>
          {applications.length > 0 && (
            <div className="card mt-4">
              {zoneLoading ? (
                <p className="text-sm text-brand-grey-1 py-8 text-center">Loading zone analysis data…</p>
              ) : zoneError ? (
                <p className="text-sm text-red-600 py-8 text-center">Failed to load spatial data. Please refresh the page.</p>
              ) : zoneAnalysisData ? (
                <ApplicationZoneAnalysis
                  trialId={trial.id}
                  applications={applications}
                  samples={samples}
                  soilChemistry={zoneAnalysisData.soilChemistry}
                  gisLayers={zoneAnalysisData.gisLayers}
                  customLayers={zoneAnalysisData.customLayers}
                />
              ) : null}
            </div>
          )}
        </>
      )}

      {activeTab === 'Soil Health' && (
        <div className="card">
          <SoilHealthTable samples={samples} />
        </div>
      )}

      {activeTab === 'Plot Data' && (
        <div className="card">
          <PlotDataTable plots={plots} />
        </div>
      )}

      {activeTab === 'Assay Results' && (
        <div className="card">
          {metadataLoading ? (
            <p className="text-sm text-brand-grey-1 py-8 text-center">Loading assay results…</p>
          ) : metadataError ? (
            <p className="text-sm text-red-600 py-8 text-center">Failed to load assay results. Please refresh the page.</p>
          ) : (
            <MetadataTable metadata={metadata || []} />
          )}
        </div>
      )}

      {activeTab === 'Photos' && (
        <div className="card">
          {photosLoading ? (
            <p className="text-sm text-brand-grey-1 py-8 text-center">Loading photos…</p>
          ) : photosError ? (
            <p className="text-sm text-red-600 py-8 text-center">Failed to load photos. Please refresh the page.</p>
          ) : (
            <PhotosTab photos={photos || []} trialId={trial.id} supabaseUrl={supabaseUrl} />
          )}
        </div>
      )}

      {/* Map tab — loading/error shown only while active and data not ready */}
      {activeTab === 'Map' && !mapData && (
        <div className="card">
          {mapError ? (
            <p className="text-sm text-red-600 py-8 text-center">Failed to load map data. Please refresh the page.</p>
          ) : (
            <p className="text-sm text-brand-grey-1 py-8 text-center">Loading map data…</p>
          )}
        </div>
      )}
      {/* Map tab — kept mounted once loaded to preserve Leaflet state across tab switches */}
      {mapData && (
        <div className="card" style={{ display: activeTab === 'Map' ? undefined : 'none' }}>
          <TrialMap
            trial={trial}
            samples={samples}
            gisLayers={mapData.gisLayers}
            customLayers={mapData.customLayers}
            soilChemistry={mapData.soilChemistry}
            linkedFields={linkedFields}
            fieldGisLayers={mapData.fieldGisLayers}
            applications={applications}
            supabaseUrl={supabaseUrl}
            visible={activeTab === 'Map'}
          />
        </div>
      )}

      {activeTab === 'Weather' && (
        <WeatherTab
          latitude={parsedGps?.[0] ?? null}
          longitude={parsedGps?.[1] ?? null}
          defaultStartDate={trial.planting_date}
          defaultEndDate={trial.harvest_date}
          locationLabel={trial.location}
        />
      )}

      {activeTab === 'Fields' && (
        <TrialFieldsPanel
          trialId={trial.id}
          linkedFields={linkedFields}
          allFields={allFields}
        />
      )}

      {activeTab === 'Management' && (
        <div className="card">
          <ManagementLog entries={log} trialId={trial.id} />
        </div>
      )}
    </div>
  )
}
