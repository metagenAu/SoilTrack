'use client'

import { Component, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, AlertTriangle } from 'lucide-react'

const TrialMapInner = dynamic(() => import('./TrialMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[500px] rounded-lg border border-brand-grey-2 bg-brand-grey-3">
      <div className="flex items-center gap-2 text-brand-grey-1 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Loading map...
      </div>
    </div>
  ),
})

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class MapErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-[500px] rounded-lg border border-brand-grey-2 bg-red-50 gap-3 px-6 text-center">
          <AlertTriangle size={32} className="text-red-400" />
          <p className="text-sm font-medium text-red-700">
            The map failed to render
          </p>
          <p className="text-xs text-red-600 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred while loading the map.'}
            {' '}Try refreshing the page. If the problem persists, one of the uploaded
            GIS layers may contain unsupported data.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 text-xs px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-100 transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default function TrialMap(props: React.ComponentProps<typeof TrialMapInner>) {
  return (
    <MapErrorBoundary>
      <TrialMapInner {...props} />
    </MapErrorBoundary>
  )
}
