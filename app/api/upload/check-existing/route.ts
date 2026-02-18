import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api-utils'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth.authenticated) return auth.response

  const trialId = request.nextUrl.searchParams.get('trialId')
  if (!trialId) {
    return NextResponse.json({ fileTypes: [] })
  }

  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('trial_data_files')
    .select('file_type')
    .eq('trial_id', trialId)
    .eq('has_data', true)

  return NextResponse.json({
    fileTypes: (data || []).map(r => r.file_type),
  })
}
