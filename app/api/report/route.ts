import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api-utils'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response

  const supabase = createServerSupabaseClient()
  const trialId = request.nextUrl.searchParams.get('trialId')

  if (!trialId) {
    return NextResponse.json({ error: 'Missing trialId' }, { status: 400 })
  }

  const [trialRes, treatmentsRes, samplesRes, plotsRes] = await Promise.all([
    supabase.from('trials').select('*').eq('id', trialId).single(),
    supabase.from('treatments').select('*').eq('trial_id', trialId).order('sort_order'),
    supabase.from('soil_health_samples').select('*').eq('trial_id', trialId).order('sample_no'),
    supabase.from('plot_data').select('*').eq('trial_id', trialId),
  ])

  if (trialRes.error || !trialRes.data) {
    return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
  }

  // Calculate yield summary by treatment
  const treatments = treatmentsRes.data || []
  const plots = plotsRes.data || []
  const treatmentMap = new Map(treatments.map(t => [t.trt_number, t]))

  const yieldByProduct: Record<string, { total: number; count: number }> = {}
  for (const p of plots) {
    if (p.yield_t_ha === null) continue
    const trt = treatmentMap.get(p.trt_number)
    const product = trt?.product || `Trt ${p.trt_number}`
    if (!yieldByProduct[product]) yieldByProduct[product] = { total: 0, count: 0 }
    yieldByProduct[product].total += p.yield_t_ha
    yieldByProduct[product].count += 1
  }

  const yieldSummary = Object.entries(yieldByProduct).map(([product, data]) => ({
    product,
    avgYield: data.count > 0 ? data.total / data.count : 0,
  })).sort((a, b) => a.avgYield - b.avgYield)

  return NextResponse.json({
    trial: trialRes.data,
    treatments,
    samples: samplesRes.data || [],
    yieldSummary,
  }, {
    headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
  })
}
