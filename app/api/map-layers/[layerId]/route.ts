import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRole, canModify } from '@/lib/auth'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { layerId: string } }
) {
  const { role } = await getUserRole()
  if (!canModify(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const { layerId } = params

  const { error: deleteError } = await supabase
    .from('custom_map_layers')
    .delete()
    .eq('id', layerId)

  if (deleteError) {
    console.error('[DELETE /api/map-layers/[layerId]]', deleteError.message)
    return NextResponse.json(
      { error: 'Failed to delete layer. Please try again.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ status: 'success' })
}
