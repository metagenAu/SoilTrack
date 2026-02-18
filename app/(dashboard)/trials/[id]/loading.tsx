export default function TrialDetailLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Back link + title */}
      <div className="space-y-2">
        <div className="h-4 w-24 bg-brand-grey-2 rounded" />
        <div className="h-8 w-64 bg-brand-grey-2 rounded-lg" />
      </div>

      {/* Summary card */}
      <div className="card">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 bg-brand-grey-2 rounded" />
              <div className="h-5 w-24 bg-brand-grey-2 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-4 border-b border-brand-grey-2 pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-5 w-20 bg-brand-grey-2 rounded" />
        ))}
      </div>

      {/* Tab content skeleton */}
      <div className="card space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-brand-grey-3 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
