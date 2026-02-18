import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRole, canUpload } from '@/lib/auth'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const { role } = await getUserRole()
  if (!canUpload(role)) {
    return NextResponse.json({ error: 'Upload permission required' }, { status: 403 })
  }
  const supabase = createServerSupabaseClient()
  const formData = await request.formData()

  const trialId = formData.get('trial_id') as string
  const name = formData.get('name') as string
  const fileType = formData.get('file_type') as string
  const geojsonPath = formData.get('geojson_path') as string | null
  const geojsonStr = formData.get('geojson') as string | null
  const storagePath = formData.get('storage_path') as string | null

  if (!trialId || !name || !fileType || (!geojsonPath && !geojsonStr)) {
    return NextResponse.json(
      { error: 'trial_id, name, file_type, and geojson or geojson_path are required' },
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

  // Load and validate GeoJSON — either from Storage (large files) or inline (small files)
  let geojson: any
  try {
    if (geojsonPath) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from('trial-gis')
        .download(geojsonPath)
      if (downloadError || !blob) {
        console.error('[POST /api/upload/gis] Storage download failed:', downloadError?.message)
        return NextResponse.json(
          { error: 'Failed to read GeoJSON from storage. Please try again.' },
          { status: 500 }
        )
      }
      geojson = JSON.parse(await blob.text())
    } else {
      geojson = JSON.parse(geojsonStr!)
    }
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

  // The raw file is uploaded directly to Supabase Storage from the client
  // to avoid Next.js API route body size limits on large shapefiles.
  // The client provides the storage_path after uploading.
  const finalStoragePath = storagePath || `${trialId}/${crypto.randomUUID()}`

  // Insert layer record
  const { data: layer, error: dbError } = await supabase
    .from('trial_gis_layers')
    .insert({
      trial_id: trialId,
      name,
      file_type: fileType,
      storage_path: finalStoragePath,
      geojson,
      feature_count: geojson.features.length,
    })
    .select()
    .single()

  if (dbError) {
    console.error('[POST /api/upload/gis] DB insert failed:', dbError.message)
    return NextResponse.json(
      { error: 'Failed to save GIS layer. Please try again.' },
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
