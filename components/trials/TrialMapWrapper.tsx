'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const TrialMap = dynamic(() => import('./TrialMap'), {
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

export default TrialMap
