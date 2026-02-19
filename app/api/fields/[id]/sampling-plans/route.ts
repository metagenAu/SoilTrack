import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth, safeErrorResponse } from '@/lib/api-utils'
import { canUpload, canModify } from '@/lib/auth'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('field_sampling_plans')
    .select('*')
    .eq('field_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return safeErrorResponse(error, 'GET /api/fields/[id]/sampling-plans')
  return NextResponse.json(data)
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canUpload(auth.role)) {
    return NextResponse.json({ error: 'Upload permission required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const body = await request.json()

  const { name, strategy, points } = body

  if (!name || !strategy || !points || !Array.isArray(points)) {
    return NextResponse.json(
      { error: 'name, strategy, and points array are required' },
      { status: 400 }
    )
  }

  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 200) {
    return NextResponse.json(
      { error: 'name must be a non-empty string (max 200 chars)' },
      { status: 400 }
    )
  }

  const validStrategies = ['random', 'grid', 'stratified']
  if (!validStrategies.includes(strategy)) {
    return NextResponse.json(
      { error: `strategy must be one of: ${validStrategies.join(', ')}` },
      { status: 400 }
    )
  }

  if (points.length > 500) {
    return NextResponse.json(
      { error: 'Maximum 500 points allowed' },
      { status: 400 }
    )
  }

  // Validate and sanitize each point
  const sanitizedPoints = []
  for (const pt of points) {
    if (
      typeof pt !== 'object' || pt === null ||
      typeof pt.lat !== 'number' || typeof pt.lng !== 'number' ||
      typeof pt.label !== 'string' ||
      !isFinite(pt.lat) || !isFinite(pt.lng) ||
      pt.lat < -90 || pt.lat > 90 ||
      pt.lng < -180 || pt.lng > 180
    ) {
      return NextResponse.json(
        { error: 'Each point must have valid numeric lat (-90..90), lng (-180..180), and string label' },
        { status: 400 }
      )
    }
    sanitizedPoints.push({
      lat: Math.round(pt.lat * 1e6) / 1e6,
      lng: Math.round(pt.lng * 1e6) / 1e6,
      label: pt.label.slice(0, 50),
    })
  }

  const { data, error } = await supabase
    .from('field_sampling_plans')
    .insert({
      field_id: params.id,
      name: name.trim().slice(0, 200),
      strategy,
      num_points: sanitizedPoints.length,
      points: sanitizedPoints,
    })
    .select()
    .single()

  if (error) return safeErrorResponse(error, 'POST /api/fields/[id]/sampling-plans')
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canUpload(auth.role)) {
    return NextResponse.json({ error: 'Upload permission required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const body = await request.json()

  const { plan_id, points } = body

  if (!plan_id || !points || !Array.isArray(points)) {
    return NextResponse.json(
      { error: 'plan_id and points array are required' },
      { status: 400 }
    )
  }

  if (points.length > 500) {
    return NextResponse.json(
      { error: 'Maximum 500 points allowed' },
      { status: 400 }
    )
  }

  // Validate and sanitize each point
  const sanitizedPoints = []
  for (const pt of points) {
    if (
      typeof pt !== 'object' || pt === null ||
      typeof pt.lat !== 'number' || typeof pt.lng !== 'number' ||
      typeof pt.label !== 'string' ||
      !isFinite(pt.lat) || !isFinite(pt.lng) ||
      pt.lat < -90 || pt.lat > 90 ||
      pt.lng < -180 || pt.lng > 180
    ) {
      return NextResponse.json(
        { error: 'Each point must have valid numeric lat (-90..90), lng (-180..180), and string label' },
        { status: 400 }
      )
    }
    sanitizedPoints.push({
      lat: Math.round(pt.lat * 1e6) / 1e6,
      lng: Math.round(pt.lng * 1e6) / 1e6,
      label: pt.label.slice(0, 50),
    })
  }

  const { data, error } = await supabase
    .from('field_sampling_plans')
    .update({
      points: sanitizedPoints,
      num_points: sanitizedPoints.length,
    })
    .eq('id', plan_id)
    .eq('field_id', params.id)
    .select()
    .single()

  if (error) return safeErrorResponse(error, 'PUT /api/fields/[id]/sampling-plans')
  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response
  if (!canModify(auth.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const planId = searchParams.get('plan_id')

  if (!planId) {
    return NextResponse.json({ error: 'plan_id query param required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('field_sampling_plans')
    .delete()
    .eq('id', planId)
    .eq('field_id', params.id)

  if (error) return safeErrorResponse(error, 'DELETE /api/fields/[id]/sampling-plans')
  return NextResponse.json({ ok: true })
}
