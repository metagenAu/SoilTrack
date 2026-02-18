'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Tag } from 'lucide-react'

interface FieldAnnotationsPanelProps {
  fieldId: string
  annotations: Array<{
    id: string
    label: string
    annotation_type: string
    created_at: string
  }>
}

export default function FieldAnnotationsPanel({
  fieldId,
  annotations,
}: FieldAnnotationsPanelProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  async function deleteAnnotation(annotationId: string) {
    if (!confirm('Delete this annotation?')) return
    setDeleting(annotationId)

    try {
      const res = await fetch(
        `/api/fields/${fieldId}/annotations?annotation_id=${annotationId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to delete')
      router.refresh()
    } catch {
      // silent
    } finally {
      setDeleting(null)
    }
  }

  if (annotations.length === 0) return null

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-brand-black mb-3">
        Annotations ({annotations.length})
      </h3>
      <div className="space-y-1">
        {annotations.map((ann) => (
          <div
            key={ann.id}
            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-brand-grey-3 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Tag size={13} className="text-brand-grey-1" />
              <span className="text-sm text-brand-black">
                {ann.label || `(${ann.annotation_type})`}
              </span>
              <span className="text-[10px] uppercase text-brand-grey-1">
                {ann.annotation_type}
              </span>
            </div>
            <button
              onClick={() => deleteAnnotation(ann.id)}
              disabled={deleting === ann.id}
              className="text-brand-grey-1 hover:text-red-500 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
