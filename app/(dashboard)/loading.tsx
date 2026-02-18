export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 bg-brand-grey-2 rounded-lg" />
        <div className="h-9 w-32 bg-brand-grey-2 rounded-lg" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <div className="h-3 w-20 bg-brand-grey-2 rounded" />
            <div className="h-7 w-16 bg-brand-grey-2 rounded" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="card space-y-4">
        <div className="h-4 w-32 bg-brand-grey-2 rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-brand-grey-3 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
