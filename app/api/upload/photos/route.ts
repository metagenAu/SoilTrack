import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const formData = await request.formData()
  const trialId = formData.get('trial_id') as string
  const files = formData.getAll('photos') as File[]

  if (!trialId) {
    return NextResponse.json({ error: 'trial_id is required' }, { status: 400 })
  }
  if (files.length === 0) {
    return NextResponse.json({ error: 'No photos provided' }, { status: 400 })
  }

  // Verify trial exists
  const { data: trial } = await supabase.from('trials').select('id').eq('id', trialId).single()
  if (!trial) {
    return NextResponse.json({ error: 'Trial not found' }, { status: 404 })
  }

  const results: { filename: string; status: 'success' | 'error'; detail?: string }[] = []

  for (const file of files) {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const storagePath = `${trialId}/${crypto.randomUUID()}.${ext}`

      const buffer = await file.arrayBuffer()
      const { error: storageError } = await supabase.storage
        .from('trial-photos')
        .upload(storagePath, buffer, {
          contentType: file.type || `image/${ext}`,
          upsert: false,
        })

      if (storageError) throw storageError

      const { error: dbError } = await supabase.from('trial_photos').insert({
        trial_id: trialId,
        filename: file.name,
        storage_path: storagePath,
      })

      if (dbError) throw dbError

      results.push({ filename: file.name, status: 'success' })
    } catch (err: any) {
      results.push({ filename: file.name, status: 'error', detail: err.message || 'Upload failed' })
    }
  }

  // Update data coverage
  const hasSuccess = results.some(r => r.status === 'success')
  if (hasSuccess) {
    await supabase.from('trial_data_files').upsert({
      trial_id: trialId, file_type: 'photo', has_data: true, last_updated: new Date().toISOString(),
    })
  }

  return NextResponse.json({ results })
}
