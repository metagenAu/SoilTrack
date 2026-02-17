'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const statuses = ['active', 'completed', 'paused'] as const
type TrialStatus = (typeof statuses)[number]

const statusConfig: Record<TrialStatus, { bg: string; text: string; border: string; dot: string }> = {
  active: {
    bg: 'bg-green-lush/10',
    text: 'text-green-rich',
    border: 'border-green-lush/20',
    dot: 'bg-green-lush',
  },
  completed: {
    bg: 'bg-brand-grey-3',
    text: 'text-brand-black/60',
    border: 'border-brand-grey-2',
    dot: 'bg-brand-grey-1',
  },
  paused: {
    bg: 'bg-[#e67e22]/10',
    text: 'text-[#9a5518]',
    border: 'border-[#e67e22]/20',
    dot: 'bg-[#e67e22]',
  },
}

interface TrialStatusToggleProps {
  trialId: string
  currentStatus: string
}

export default function TrialStatusToggle({ trialId, currentStatus }: TrialStatusToggleProps) {
  const [status, setStatus] = useState<TrialStatus>(
    statuses.includes(currentStatus as TrialStatus) ? (currentStatus as TrialStatus) : 'active'
  )
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleChange(newStatus: TrialStatus) {
    if (newStatus === status) {
      setOpen(false)
      return
    }

    setSaving(true)
    setOpen(false)

    const supabase = createClient()
    const { error } = await supabase
      .from('trials')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', trialId)

    if (error) {
      console.error('Failed to update trial status:', error)
      setSaving(false)
      return
    }

    setStatus(newStatus)
    setSaving(false)
    router.refresh()
  }

  const config = statusConfig[status]

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        disabled={saving}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border transition-colors cursor-pointer',
          config.bg,
          config.text,
          config.border,
          saving && 'opacity-50 cursor-wait'
        )}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
        {status}
        <svg
          className={cn('w-3 h-3 transition-transform', open && 'rotate-180')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-brand-grey-2 py-1 z-50 min-w-[130px]">
          {statuses.map((s) => {
            const c = statusConfig[s]
            return (
              <button
                key={s}
                onClick={() => handleChange(s)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium capitalize hover:bg-brand-grey-3 transition-colors text-left',
                  s === status ? 'bg-brand-grey-3/50' : ''
                )}
              >
                <span className={cn('w-2 h-2 rounded-full', c.dot)} />
                <span className={c.text}>{s}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
