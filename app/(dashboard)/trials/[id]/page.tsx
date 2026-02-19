import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRole, canUpload } from '@/lib/auth'
import { notFound } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'
import TrialStatusToggle from '@/components/trials/TrialStatusToggle'
import DataBadge from '@/components/ui/DataBadge'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { Upload } from 'lucide-react'
import TrialDetailTabs from './TrialDetailTabs'

export const dynamic = 'force-dynamic'

async function getTrialData(id: string) {
  const supabase = createServerSupabaseClient()

  // Only fetch essential data upfront; heavy tab-specific data is loaded client-side
  const [trialRes, treatmentsRes, samplesRes, plotsRes, logRes, dataFilesRes, chemCountRes, tissueCountRes, metadataCountRes, photosCountRes, gisCountRes, linkedFieldsRes, allFieldsRes, applicationsRes] = await Promise.all([
    supabase.from('trials').select('*').eq('id', id).single(),
    supabase.from('treatments').select('*').eq('trial_id', id).order('sort_order'),
    supabase.from('soil_health_samples').select('*').eq('trial_id', id).order('sample_no'),
    supabase.from('plot_data').select('*').eq('trial_id', id).order('plot'),
    supabase.from('management_log').select('*').eq('trial_id', id).order('date'),
    supabase.from('trial_data_files').select('*').eq('trial_id', id),
    // Use count-only queries for data we only need to count for badges
    supabase.from('soil_chemistry').select('*', { count: 'exact', head: true }).eq('trial_id', id),
    supabase.from('tissue_chemistry').select('*', { count: 'exact', head: true }).eq('trial_id', id),
    supabase.from('sample_metadata').select('*', { count: 'exact', head: true }).eq('trial_id', id),
    supabase.from('trial_photos').select('*', { count: 'exact', head: true }).eq('trial_id', id),
    supabase.from('trial_gis_layers').select('*', { count: 'exact', head: true }).eq('trial_id', id),
    supabase.from('field_trials').select('*, fields(id, name, farm, region, area_ha, boundary)').eq('trial_id', id).order('created_at'),
    supabase.from('fields').select('id, name, farm, region, area_ha').order('name'),
    supabase.from('trial_applications').select('*').eq('trial_id', id).order('created_at'),
  ])

  if (trialRes.error || !trialRes.data) return null

  // Build data coverage map
  const dataFiles = dataFilesRes.data || []
  const dataCoverage: Record<string, boolean> = {
    soilHealth: false,
    soilChemistry: false,
    plotData: false,
    tissueChemistry: false,
    sampleMetadata: false,
    photo: false,
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

  const linkedFields = linkedFieldsRes.data || []

  return {
    trial: trialRes.data,
    treatments,
    samples: samplesRes.data || [],
    plots,
    log: logRes.data || [],
    dataCoverage,
    chemistryCount: chemCountRes.count || 0,
    tissueCount: tissueCountRes.count || 0,
    metadataCount: metadataCountRes.count || 0,
    photosCount: photosCountRes.count || 0,
    gisCount: gisCountRes.count || 0,
    linkedFields,
    allFields: allFieldsRes.data || [],
    applications: applicationsRes.data || [],
  }
}

export default async function TrialDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const id = decodeURIComponent(params.id)
  const [data, { role }] = await Promise.all([getTrialData(id), getUserRole()])

  if (!data) notFound()

  const { trial, treatments, samples, plots, log, dataCoverage, metadataCount, photosCount, gisCount, linkedFields, allFields, applications } = data

  return (
    <div>
      {/* Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-lg font-semibold text-brand-black/60">{trial.id}</span>
              <TrialStatusToggle trialId={trial.id} currentStatus={trial.status} />
            </div>
            <h1 className="text-xl font-bold text-brand-black mb-1">{trial.name}</h1>
            <div className="flex items-center gap-4 text-sm text-brand-grey-1">
              {trial.grower && <span>{trial.grower}</span>}
              {trial.location && <span>{trial.location}</span>}
              {trial.crop && <span>{trial.crop}</span>}
              {trial.trial_type && <span>{trial.trial_type}</span>}
            </div>
          </div>
          {canUpload(role) && (
            <Link href={`/data-hub?trial=${encodeURIComponent(trial.id)}`}>
              <Button size="sm">
                <Upload size={14} />
                Upload Data
              </Button>
            </Link>
          )}
        </div>

        {/* Data coverage badges */}
        <div className="flex gap-4 mt-4 pt-4 border-t border-brand-grey-2">
          <DataBadge label="Soil Health" hasData={dataCoverage.soilHealth} />
          <DataBadge label="Chemistry" hasData={dataCoverage.soilChemistry} />
          <DataBadge label="Plot Data" hasData={dataCoverage.plotData} />
          <DataBadge label="Tissue" hasData={dataCoverage.tissueChemistry} />
          <DataBadge label="Assay Results" hasData={dataCoverage.sampleMetadata} />
          <DataBadge label="Photos" hasData={dataCoverage.photo || photosCount > 0} />
          <DataBadge label="GIS" hasData={dataCoverage.gis || gisCount > 0} />
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
        metadataCount={metadataCount}
        photosCount={photosCount}
        linkedFields={linkedFields}
        allFields={allFields}
        applications={applications}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      />
    </div>
  )
}
