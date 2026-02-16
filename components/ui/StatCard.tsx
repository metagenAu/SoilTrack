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
      <p className="text-2xl font-bold text-brand-black">{value}</p>
    </div>
  )
}
