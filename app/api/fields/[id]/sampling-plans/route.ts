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

  const { name, strategy, num_points, points } = body

  if (!name || !strategy || !points) {
    return NextResponse.json(
      { error: 'name, strategy, and points are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('field_sampling_plans')
    .insert({
      field_id: params.id,
      name,
      strategy,
      num_points: num_points || points.length,
      points,
    })
    .select()
    .single()

  if (error) return safeErrorResponse(error, 'POST /api/fields/[id]/sampling-plans')
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  request: Request,
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

  if (error) return safeErrorResponse(error, 'DELETE /api/fields/[id]/sampling-plans')
  return NextResponse.json({ ok: true })
}
