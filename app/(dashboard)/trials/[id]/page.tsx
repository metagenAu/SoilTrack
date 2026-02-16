import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'
import StatusPill from '@/components/ui/StatusPill'
import DataBadge from '@/components/ui/DataBadge'
import StatCard from '@/components/ui/StatCard'
import TreatmentsTable from '@/components/trials/TreatmentsTable'
import SoilHealthTable from '@/components/trials/SoilHealthTable'
import PlotDataTable from '@/components/trials/PlotDataTable'
import ManagementLog from '@/components/trials/ManagementLog'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { Upload } from 'lucide-react'
import TrialDetailTabs from './TrialDetailTabs'

export const dynamic = 'force-dynamic'

async function getTrialData(id: string) {
  const supabase = createServerSupabaseClient()

  const [trialRes, treatmentsRes, samplesRes, plotsRes, logRes, dataFilesRes, chemRes, tissueRes] = await Promise.all([
    supabase.from('trials').select('*').eq('id', id).single(),
    supabase.from('treatments').select('*').eq('trial_id', id).order('sort_order'),
    supabase.from('soil_health_samples').select('*').eq('trial_id', id).order('sample_no'),
    supabase.from('plot_data').select('*').eq('trial_id', id).order('plot'),
    supabase.from('management_log').select('*').eq('trial_id', id).order('date'),
    supabase.from('trial_data_files').select('*').eq('trial_id', id),
    supabase.from('soil_chemistry').select('*').eq('trial_id', id),
    supabase.from('tissue_chemistry').select('*').eq('trial_id', id),
  ])

  if (trialRes.error || !trialRes.data) return null

  // Build data coverage map
  const dataFiles = dataFilesRes.data || []
  const dataCoverage: Record<string, boolean> = {
    soilHealth: false,
    soilChemistry: false,
    plotData: false,
    tissueChemistry: false,
  }
  for (const df of dataFiles) {
    dataCoverage[df.file_type] = df.has_data
  }

  // Enrich plot data with treatment info
  const treatments = treatmentsRes.data || []
  const treatmentMap = new Map(treatments.map(t => [t.trt_number, t]))
  const plots = (plotsRes.data || []).map(p => ({
    ...p,
    treatment_product: treatmentMap.get(p.trt_number)?.product || null,
    treatment_application: treatmentMap.get(p.trt_number)?.application || null,
  }))

  return {
    trial: trialRes.data,
    treatments,
    samples: samplesRes.data || [],
    plots,
    log: logRes.data || [],
    dataCoverage,
    chemistryCount: (chemRes.data || []).length,
    tissueCount: (tissueRes.data || []).length,
  }
}

export default async function TrialDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const id = decodeURIComponent(params.id)
  const data = await getTrialData(id)

  if (!data) notFound()

  const { trial, treatments, samples, plots, log, dataCoverage } = data

  return (
    <div>
      {/* Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-lg font-bold text-meta-blue">{trial.id}</span>
              <StatusPill status={trial.status} />
            </div>
            <h1 className="text-xl font-bold text-brand-black mb-1">{trial.name}</h1>
            <div className="flex items-center gap-4 text-sm text-brand-grey-1">
              {trial.grower && <span>{trial.grower}</span>}
              {trial.location && <span>{trial.location}</span>}
              {trial.crop && <span>{trial.crop}</span>}
              {trial.trial_type && <span>{trial.trial_type}</span>}
            </div>
          </div>
          <Link href={`/data-hub?trial=${encodeURIComponent(trial.id)}`}>
            <Button size="sm">
              <Upload size={14} />
              Upload Data
            </Button>
          </Link>
        </div>

        {/* Data coverage badges */}
        <div className="flex gap-4 mt-4 pt-4 border-t border-brand-grey-2">
          <DataBadge label="Soil Health" hasData={dataCoverage.soilHealth} />
          <DataBadge label="Chemistry" hasData={dataCoverage.soilChemistry} />
          <DataBadge label="Plot Data" hasData={dataCoverage.plotData} />
          <DataBadge label="Tissue" hasData={dataCoverage.tissueChemistry} />
        </div>
      </div>

      {/* Tabs */}
      <TrialDetailTabs
        trial={trial}
        treatments={treatments}
        samples={samples}
        plots={plots}
        log={log}
        dataCoverage={dataCoverage}
      />
    </div>
  )
}
