import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRole, canUpload } from '@/lib/auth'
import { notFound } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'
import StatusPill from '@/components/ui/StatusPill'
import TrialStatusToggle from '@/components/trials/TrialStatusToggle'
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

  const [trialRes, treatmentsRes, samplesRes, plotsRes, logRes, dataFilesRes, chemRes, tissueRes, metadataRes, photosRes, gisRes, customLayersRes, linkedFieldsRes, allFieldsRes] = await Promise.all([
    supabase.from('trials').select('*').eq('id', id).single(),
    supabase.from('treatments').select('*').eq('trial_id', id).order('sort_order'),
    supabase.from('soil_health_samples').select('*').eq('trial_id', id).order('sample_no'),
    supabase.from('plot_data').select('*').eq('trial_id', id).order('plot'),
    supabase.from('management_log').select('*').eq('trial_id', id).order('date'),
    supabase.from('trial_data_files').select('*').eq('trial_id', id),
    supabase.from('soil_chemistry').select('*').eq('trial_id', id),
    supabase.from('tissue_chemistry').select('*').eq('trial_id', id),
    supabase.from('sample_metadata').select('*').eq('trial_id', id).order('sample_no'),
    supabase.from('trial_photos').select('*').eq('trial_id', id).order('created_at', { ascending: false }),
    supabase.from('trial_gis_layers').select('*').eq('trial_id', id).order('created_at'),
    supabase.from('custom_map_layers').select('*').eq('trial_id', id).order('created_at'),
    supabase.from('field_trials').select('*, fields(id, name, farm, region, area_ha, boundary)').eq('trial_id', id).order('created_at'),
    supabase.from('fields').select('id, name, farm, region, area_ha').order('name'),
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

  // Extract field GIS layers for linked fields (for map overlay)
  const linkedFields = linkedFieldsRes.data || []
  const fieldIds = linkedFields.map((lf: any) => lf.field_id).filter(Boolean)
  let fieldGisLayers: any[] = []
  if (fieldIds.length > 0) {
    const { data: fGis } = await supabase
      .from('field_gis_layers')
      .select('*')
      .in('field_id', fieldIds)
      .order('created_at')
    fieldGisLayers = fGis || []
  }

  return {
    trial: trialRes.data,
    treatments,
    samples: samplesRes.data || [],
    plots,
    log: logRes.data || [],
    dataCoverage,
    chemistryCount: (chemRes.data || []).length,
    soilChemistry: chemRes.data || [],
    tissueCount: (tissueRes.data || []).length,
    metadata: metadataRes.data || [],
    photos: photosRes.data || [],
    gisLayers: gisRes.data || [],
    customLayers: customLayersRes.data || [],
    linkedFields,
    allFields: allFieldsRes.data || [],
    fieldGisLayers,
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

  const { trial, treatments, samples, plots, log, dataCoverage, soilChemistry, metadata, photos, gisLayers, customLayers, linkedFields, allFields, fieldGisLayers } = data

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
          <DataBadge label="Photos" hasData={dataCoverage.photo || photos.length > 0} />
          <DataBadge label="GIS" hasData={dataCoverage.gis || gisLayers.length > 0} />
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
        soilChemistry={soilChemistry}
        metadata={metadata}
        photos={photos}
        gisLayers={gisLayers}
        customLayers={customLayers}
        linkedFields={linkedFields}
        allFields={allFields}
        fieldGisLayers={fieldGisLayers}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      />
    </div>
  )
}
