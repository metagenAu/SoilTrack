import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'
import FieldDetailTabs from '@/components/fields/FieldDetailTabs'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getFieldData(id: string) {
  const supabase = createServerSupabaseClient()

  const [fieldRes, fieldTrialsRes, annotationsRes, samplingPlansRes, gisLayersRes, allTrialsRes, clientsRes] = await Promise.all([
    supabase.from('fields').select('*').eq('id', id).single(),
    supabase.from('field_trials').select('*, trials(*)').eq('field_id', id).order('created_at'),
    supabase.from('field_annotations').select('*').eq('field_id', id).order('created_at'),
    supabase.from('field_sampling_plans').select('*').eq('field_id', id).order('created_at', { ascending: false }),
    supabase.from('field_gis_layers').select('*').eq('field_id', id).order('created_at'),
    supabase.from('trials').select('id, name, crop, status, grower, location').order('name'),
    supabase.from('clients').select('id, name, farm').order('name'),
  ])

  if (fieldRes.error || !fieldRes.data) return null

  // Load trial spatial data for linked trials (sample points + GIS layers)
  const fieldTrials = fieldTrialsRes.data || []
  const linkedTrialIds = fieldTrials.map((ft: any) => ft.trial_id).filter(Boolean)
  let trialSamples: any[] = []
  let trialGisLayers: any[] = []
  if (linkedTrialIds.length > 0) {
    const [samplesRes, tGisRes] = await Promise.all([
      supabase
        .from('soil_health_samples')
        .select('sample_no, latitude, longitude, property, block, trial_id')
        .in('trial_id', linkedTrialIds)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('sample_no'),
      supabase
        .from('trial_gis_layers')
        .select('*')
        .in('trial_id', linkedTrialIds)
        .order('created_at'),
    ])
    trialSamples = samplesRes.data || []
    trialGisLayers = tGisRes.data || []
  }

  return {
    field: fieldRes.data,
    fieldTrials,
    annotations: annotationsRes.data || [],
    samplingPlans: samplingPlansRes.data || [],
    gisLayers: gisLayersRes.data || [],
    allTrials: allTrialsRes.data || [],
    clients: clientsRes.data || [],
    trialSamples,
    trialGisLayers,
  }
}

export default async function FieldDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const data = await getFieldData(params.id)

  if (!data) notFound()

  const { field, fieldTrials, annotations, samplingPlans, gisLayers, allTrials, clients, trialSamples, trialGisLayers } = data
  const clientName = field.client_id
    ? clients.find((c) => c.id === field.client_id)?.name || null
    : null

  return (
    <div>
      {/* Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="signpost-label mb-1">FIELD</p>
            <h1 className="text-xl font-bold text-brand-black mb-1">{field.name}</h1>
            <div className="flex items-center gap-4 text-sm text-brand-grey-1">
              {field.farm && <span>{field.farm}</span>}
              {field.region && <span>{field.region}</span>}
              {field.area_ha != null && <span>{field.area_ha} ha</span>}
              {clientName && (
                <Link
                  href={`/clients/${field.client_id}`}
                  className="text-meta-blue hover:underline"
                >
                  {clientName}
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {field.boundary && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-green-50 text-green-700 font-medium">
                Boundary set
              </span>
            )}
            {field.boundary_source && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-brand-grey-3 text-brand-grey-1">
                via {field.boundary_source}
              </span>
            )}
          </div>
        </div>
      </div>

      <FieldDetailTabs
        field={field}
        fieldTrials={fieldTrials}
        annotations={annotations}
        samplingPlans={samplingPlans}
        gisLayers={gisLayers}
        allTrials={allTrials}
        clients={clients}
        trialSamples={trialSamples}
        trialGisLayers={trialGisLayers}
      />
    </div>
  )
}
