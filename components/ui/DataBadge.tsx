import { cn } from '@/lib/utils'
import { Check, Circle } from 'lucide-react'

interface DataBadgeProps {
  label: string
  hasData: boolean
  className?: string
}

export default function DataBadge({ label, hasData, className }: DataBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        hasData ? 'text-green-lush' : 'text-brand-grey-1',
        className
      )}
    >
      {hasData ? <Check size={14} /> : <Circle size={14} />}
      {label}
    </span>
  )
}
