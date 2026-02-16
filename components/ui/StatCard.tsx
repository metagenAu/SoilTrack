import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  borderColor?: string
  className?: string
}

export default function StatCard({ label, value, borderColor, className }: StatCardProps) {
  return (
    <div
      className={cn('card', className)}
      style={borderColor ? { borderTopWidth: '3px', borderTopColor: borderColor } : undefined}
    >
      <p className="signpost-label mb-1">{label}</p>
      <p className="text-2xl font-semibold text-brand-black tracking-tight">{value}</p>
    </div>
  )
}
