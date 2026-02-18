import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('fields')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()

  const { name, client_id, region, farm, area_ha, boundary, boundary_source, notes } = body

  if (!name) {
    return NextResponse.json({ error: 'Field name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('fields')
    .insert({
      name,
      client_id: client_id || null,
      region: region || null,
      farm: farm || null,
      area_ha: area_ha || null,
      boundary: boundary || null,
      boundary_source: boundary_source || null,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
