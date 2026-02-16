'use client'

import { useState, useRef } from 'react'
import { Camera, Upload, Trash2, X, Loader2, Image as ImageIcon } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface TrialPhoto {
  id: string
  trial_id: string
  filename: string
  storage_path: string
  caption: string | null
  taken_at: string | null
  created_at: string
}

interface PhotosTabProps {
  photos: TrialPhoto[]
  trialId: string
  supabaseUrl: string
}

function getPublicUrl(supabaseUrl: string, storagePath: string) {
  return `${supabaseUrl}/storage/v1/object/public/trial-photos/${storagePath}`
}

export default function PhotosTab({ photos: initialPhotos, trialId, supabaseUrl }: PhotosTabProps) {
  const [photos, setPhotos] = useState(initialPhotos)
  const [uploading, setUploading] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState<TrialPhoto | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(fileList: FileList) {
    const files = Array.from(fileList).filter(f =>
      /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    )
    if (files.length === 0) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('trial_id', trialId)
      for (const file of files) {
        formData.append('photos', file)
      }

      const res = await fetch('/api/upload/photos', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error(`Upload failed (${res.status})`)

      // Reload photos from Supabase
      const supabase = createClient()
      const { data } = await supabase
        .from('trial_photos')
        .select('*')
        .eq('trial_id', trialId)
        .order('created_at', { ascending: false })

      if (data) setPhotos(data)
    } catch (err) {
      console.error('Photo upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(photo: TrialPhoto) {
    setDeleting(photo.id)
    try {
      const supabase = createClient()

      // Delete from storage first
      const { error: storageErr } = await supabase.storage.from('trial-photos').remove([photo.storage_path])
      if (storageErr) throw storageErr

      // Delete from database
      const { error: dbErr } = await supabase.from('trial_photos').delete().eq('id', photo.id)
      if (dbErr) throw dbErr

      setPhotos(prev => prev.filter(p => p.id !== photo.id))
      if (lightboxPhoto?.id === photo.id) setLightboxPhoto(null)
    } catch (err) {
      console.error('Photo delete failed:', err)
      // Re-fetch to sync UI with actual server state
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('trial_photos')
          .select('*')
          .eq('trial_id', trialId)
          .order('created_at', { ascending: false })
        if (data) setPhotos(data)
      } catch { /* best-effort sync */ }
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="signpost-label">TRIAL PHOTOS ({photos.length})</p>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleUpload(e.target.files)
              }
            }}
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={14} />
                Upload Photos
              </>
            )}
          </Button>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-12 text-brand-grey-1">
          <Camera size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium mb-1">No photos yet</p>
          <p className="text-xs">Upload trial photos using the button above or via the Data Hub.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square rounded-lg overflow-hidden bg-brand-grey-3 cursor-pointer border border-brand-grey-2 hover:border-brand-grey-1/50 transition-colors"
              onClick={() => setLightboxPhoto(photo)}
            >
              <img
                src={getPublicUrl(supabaseUrl, photo.storage_path)}
                alt={photo.caption || photo.filename}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-xs text-white truncate">{photo.filename}</p>
                {photo.created_at && (
                  <p className="text-[10px] text-white/70">{formatDate(photo.created_at)}</p>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(photo)
                }}
                disabled={deleting === photo.id}
                className="absolute top-2 right-2 p-1 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
              >
                {deleting === photo.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
            onClick={() => setLightboxPhoto(null)}
          >
            <X size={24} />
          </button>
          <div
            className="max-w-4xl max-h-[85vh] mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={getPublicUrl(supabaseUrl, lightboxPhoto.storage_path)}
              alt={lightboxPhoto.caption || lightboxPhoto.filename}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <div className="mt-2 text-center">
              <p className="text-sm text-white/90">{lightboxPhoto.filename}</p>
              {lightboxPhoto.created_at && (
                <p className="text-xs text-white/60">{formatDate(lightboxPhoto.created_at)}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
