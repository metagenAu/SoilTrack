'use client'

import { useEffect } from 'react'
import Button from '@/components/ui/Button'

export default function TrialDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Trial detail error:', error)
  }, [error])

  return (
    <div className="card text-center py-12">
      <h2 className="text-lg font-semibold text-brand-black mb-2">Something went wrong</h2>
      <p className="text-sm text-brand-grey-1 mb-6 max-w-md mx-auto">
        {error.message || 'An unexpected error occurred while loading this trial.'}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
