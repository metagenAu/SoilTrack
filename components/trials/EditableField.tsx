'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Pencil } from 'lucide-react'

interface EditableFieldProps {
  trialId: string
  field: string
  value: string | number | null
  type?: 'text' | 'date' | 'number'
  /** Extra class on the display value */
  className?: string
}

export default function EditableField({
  trialId,
  field,
  value,
  type = 'text',
  className,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // Keep draft in sync if value changes from server refresh
  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  function displayValue() {
    if (value === null || value === undefined || value === '') return '—'
    if (type === 'date' && typeof value === 'string') {
      // Format YYYY-MM-DD to a readable date
      const d = new Date(value + 'T00:00:00')
      if (isNaN(d.getTime())) return value
      return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    return String(value)
  }

  async function save() {
    const trimmed = type === 'number' ? Number(draft) || 0 : (String(draft).trim() || null)

    // No change — just close
    if (trimmed === (value ?? (type === 'number' ? 0 : null))) {
      setEditing(false)
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('trials')
      .update({ [field]: trimmed, updated_at: new Date().toISOString() })
      .eq('id', trialId)

    setSaving(false)

    if (error) {
      console.error(`Failed to update ${field}:`, error)
      return
    }

    setEditing(false)
    router.refresh()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    }
    if (e.key === 'Escape') {
      setDraft(value ?? '')
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
        value={draft}
        onChange={(e) => setDraft(type === 'number' ? e.target.value : e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className={cn(
          'w-full max-w-[200px] px-1.5 py-0.5 text-sm rounded border border-meta-blue/40 bg-white outline-none focus:border-meta-blue focus:ring-1 focus:ring-meta-blue/20',
          type === 'number' && 'max-w-[80px] text-right',
          type === 'date' && 'max-w-[160px]',
          saving && 'opacity-50',
          className
        )}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        'group inline-flex items-center gap-1.5 text-right cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 transition-colors hover:bg-brand-grey-3',
        className
      )}
      title={`Edit ${field}`}
    >
      <span>{displayValue()}</span>
      <Pencil
        size={11}
        className="text-brand-grey-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      />
    </button>
  )
}
