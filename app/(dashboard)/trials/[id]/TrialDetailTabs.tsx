'use client'

import { useState } from 'react'
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

interface TrialDetailTabsProps {
  trial: any
  treatments: any[]
  samples: any[]
  plots: any[]
  log: any[]
  dataCoverage: Record<string, boolean>
  metadata: any[]
  photos: any[]
  gisLayers: any[]
  pointSets: any[]
  supabaseUrl: string
}

const tabs = ['Summary', 'Treatments', 'Soil Health', 'Plot Data', 'Assay Results', 'Photos', 'Map', 'Management']

export default function TrialDetailTabs({
  trial,
  treatments,
  samples,
  plots,
  log,
  dataCoverage,
  metadata,
  photos,
  gisLayers,
  pointSets,
  supabaseUrl,
}: TrialDetailTabsProps) {
  const [activeTab, setActiveTab] = useState('Summary')

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
              <StatCard label="ASSAY RESULTS" value={metadata.length} borderColor="#DCDDDF" />
              <StatCard label="PHOTOS" value={photos.length} borderColor="#B9BCBF" />
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
          <MetadataTable metadata={metadata} />
        </div>
      )}

      {activeTab === 'Photos' && (
        <div className="card">
          <PhotosTab photos={photos} trialId={trial.id} supabaseUrl={supabaseUrl} />
        </div>
      )}

      {activeTab === 'Map' && (
        <div className="card">
          <TrialMap
            trial={trial}
            samples={samples}
            gisLayers={gisLayers}
            pointSets={pointSets}
            supabaseUrl={supabaseUrl}
          />
        </div>
      )}

      {activeTab === 'Management' && (
        <div className="card">
          <ManagementLog entries={log} trialId={trial.id} />
        </div>
      )}
    </div>
  )
}
