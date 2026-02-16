'use client'

import { useState } from 'react'
import { cn, formatDate } from '@/lib/utils'
import TreatmentsTable from '@/components/trials/TreatmentsTable'
import SoilHealthTable from '@/components/trials/SoilHealthTable'
import PlotDataTable from '@/components/trials/PlotDataTable'
import ManagementLog from '@/components/trials/ManagementLog'
import MetadataTable from '@/components/trials/MetadataTable'
import PhotosTab from '@/components/trials/PhotosTab'
import StatCard from '@/components/ui/StatCard'

interface TrialDetailTabsProps {
  trial: any
  treatments: any[]
  samples: any[]
  plots: any[]
  log: any[]
  dataCoverage: Record<string, boolean>
  metadata: any[]
  photos: any[]
  supabaseUrl: string
}

const tabs = ['Summary', 'Treatments', 'Soil Health', 'Plot Data', 'Assay Results', 'Photos', 'Management']

export default function TrialDetailTabs({
  trial,
  treatments,
  samples,
  plots,
  log,
  dataCoverage,
  metadata,
  photos,
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
                ? 'border-meta-blue text-meta-blue'
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
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">Trial ID</dt>
                <dd className="font-mono font-medium">{trial.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">Grower</dt>
                <dd>{trial.grower || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">Location</dt>
                <dd>{trial.location || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">GPS</dt>
                <dd className="font-mono text-xs">{trial.gps || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">Crop</dt>
                <dd>{trial.crop || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">Trial Type</dt>
                <dd>{trial.trial_type || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">Contact</dt>
                <dd>{trial.contact || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">Planting Date</dt>
                <dd>{formatDate(trial.planting_date)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">Harvest Date</dt>
                <dd>{formatDate(trial.harvest_date)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">Treatments</dt>
                <dd>{trial.num_treatments}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-brand-grey-1">Reps</dt>
                <dd>{trial.reps}</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-4">
            <p className="signpost-label">DATA COVERAGE</p>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="SOIL SAMPLES" value={samples.length} borderColor="#00BB7E" />
              <StatCard label="TREATMENTS" value={treatments.length} borderColor="#008BCE" />
              <StatCard label="PLOT RECORDS" value={plots.length} borderColor="#006AC6" />
              <StatCard label="ASSAY RESULTS" value={metadata.length} borderColor="#009775" />
              <StatCard label="PHOTOS" value={photos.length} borderColor="#E67E22" />
              <StatCard label="LOG ENTRIES" value={log.length} borderColor="#004C97" />
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

      {activeTab === 'Management' && (
        <div className="card">
          <ManagementLog entries={log} trialId={trial.id} />
        </div>
      )}
    </div>
  )
}
