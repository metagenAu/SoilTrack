import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getUserRole, canUpload } from '@/lib/auth'
import { validatePhotoFile, safeErrorResponse } from '@/lib/api-utils'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const { role } = await getUserRole()
  if (!canUpload(role)) {
    return NextResponse.json({ error: 'Upload permission required' }, { status: 403 })
  }
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
    // H2: Validate file type and size
    const validationError = validatePhotoFile(file)
    if (validationError) {
      results.push({ filename: file.name, status: 'error', detail: validationError })
      continue
    }

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif']
      const safeExt = allowedExts.includes(ext) ? ext : 'jpg'
      const storagePath = `${trialId}/${crypto.randomUUID()}.${safeExt}`

      const buffer = await file.arrayBuffer()
      const { error: storageError } = await supabase.storage
        .from('trial-photos')
        .upload(storagePath, buffer, {
          contentType: file.type || `image/${safeExt}`,
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
      console.error(`Photo upload error for ${file.name}:`, err?.message)
      results.push({ filename: file.name, status: 'error', detail: 'Upload failed' })
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
