import { cn } from '@/lib/utils'

const statusStyles: Record<string, string> = {
  active: 'bg-green-lush text-white',
  completed: 'bg-meta-blue text-white',
  paused: 'bg-[#e67e22] text-white',
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
        statusStyles[status] || 'bg-brand-grey-1 text-white',
        className
      )}
    >
      {status}
    </span>
  )
}
