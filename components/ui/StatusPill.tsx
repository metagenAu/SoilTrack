import { cn } from '@/lib/utils'

const statusStyles: Record<string, string> = {
  active: 'bg-green-lush/10 text-green-rich border border-green-lush/20',
  completed: 'bg-brand-grey-3 text-brand-black/60 border border-brand-grey-2',
  paused: 'bg-[#e67e22]/10 text-[#9a5518] border border-[#e67e22]/20',
}

interface StatusPillProps {
  status: string
  className?: string
}

export default function StatusPill({ status, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize',
        statusStyles[status] || 'bg-brand-grey-3 text-brand-black/50 border border-brand-grey-2',
        className
      )}
    >
      {status}
    </span>
  )
}
