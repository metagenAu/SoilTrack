import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { layerId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { layerId } = params

  // Fetch the layer to get storage path
  const { data: layer, error: fetchError } = await supabase
    .from('trial_gis_layers')
    .select('*')
    .eq('id', layerId)
    .single()

  if (fetchError || !layer) {
    return NextResponse.json({ error: 'Layer not found' }, { status: 404 })
  }

  // Delete from storage
  if (layer.storage_path) {
    await supabase.storage.from('trial-gis').remove([layer.storage_path])
  }

  // Delete from database
  const { error: deleteError } = await supabase
    .from('trial_gis_layers')
    .delete()
    .eq('id', layerId)

  if (deleteError) {
    return NextResponse.json(
      { error: `Delete failed: ${deleteError.message}` },
      { status: 500 }
    )
  }

  // Check if trial has any remaining GIS layers
  const { data: remaining } = await supabase
    .from('trial_gis_layers')
    .select('id')
    .eq('trial_id', layer.trial_id)
    .limit(1)

  if (!remaining || remaining.length === 0) {
    await supabase.from('trial_data_files').upsert({
      trial_id: layer.trial_id,
      file_type: 'gis',
      has_data: false,
      last_updated: new Date().toISOString(),
    })
  }

  return NextResponse.json({ status: 'success' })
}
