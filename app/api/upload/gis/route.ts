import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const formData = await request.formData()

  const trialId = formData.get('trial_id') as string
  const name = formData.get('name') as string
  const fileType = formData.get('file_type') as string
  const geojsonStr = formData.get('geojson') as string
  const file = formData.get('file') as File | null

  if (!trialId || !name || !fileType || !geojsonStr) {
    return NextResponse.json(
      { error: 'trial_id, name, file_type, and geojson are required' },
      { status: 400 }
    )
  }

  // Validate file_type
  const validTypes = ['shapefile', 'kml', 'kmz', 'geojson']
  if (!validTypes.includes(fileType)) {
    return NextResponse.json(
      { error: `Invalid file_type. Must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    )
  }

  // Parse and validate GeoJSON
  let geojson: any
  try {
    geojson = JSON.parse(geojsonStr)
    if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
      throw new Error('Must be a GeoJSON FeatureCollection')
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Invalid GeoJSON: ${err.message}` },
      { status: 400 }
    )
  }

  // Verify trial exists
  const { data: trial } = await supabase.from('trials').select('id').eq('id', trialId).single()
  if (!trial) {
    return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
  }

  // Store raw file in Supabase Storage (if provided)
  const layerId = crypto.randomUUID()
  let storagePath = `${trialId}/${layerId}`

  if (file) {
    const ext = file.name.split('.').pop()?.toLowerCase() || fileType
    storagePath = `${trialId}/${layerId}.${ext}`

    const buffer = await file.arrayBuffer()
    const { error: storageError } = await supabase.storage
      .from('trial-gis')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (storageError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${storageError.message}` },
        { status: 500 }
      )
    }
  }

  // Insert layer record
  const { data: layer, error: dbError } = await supabase
    .from('trial_gis_layers')
    .insert({
      trial_id: trialId,
      name,
      file_type: fileType,
      storage_path: storagePath,
      geojson,
      feature_count: geojson.features.length,
    })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json(
      { error: `Database insert failed: ${dbError.message}` },
      { status: 500 }
    )
  }

  // Update data coverage
  await supabase.from('trial_data_files').upsert({
    trial_id: trialId,
    file_type: 'gis',
    has_data: true,
    last_updated: new Date().toISOString(),
  })

  return NextResponse.json({ status: 'success', layer })
}
