'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Map, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Lazy-load tab content so only the active tab's JS downloads
const MapTab = dynamic(() => import('./MapTab'), {
  loading: () => <div className="h-96 animate-pulse bg-brand-grey-3 rounded-lg" />,
})
const SummaryTab = dynamic(() => import('./SummaryTab'), {
  loading: () => <div className="h-96 animate-pulse bg-brand-grey-3 rounded-lg" />,
})

export interface Trial {
  id: string
  name: string
  crop: string | null
  location: string | null
  gps: string | null
  status: string
  trial_type: string | null
  planting_date: string | null
  harvest_date: string | null
  created_at: string
  sample_count: number
}

interface AnalyticsDashboardProps {
  trials: Trial[]
  totalClients: number
  totalSamples: number
}

const tabs = [
  { key: 'map', label: 'Trial Map', icon: Map },
  { key: 'summary', label: 'Summary', icon: BarChart3 },
] as const

type TabKey = (typeof tabs)[number]['key']

export default function AnalyticsDashboard({
  trials,
  totalClients,
  totalSamples,
}: AnalyticsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('map')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-brand-grey-2 mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.key
                  ? 'border-brand-black text-brand-black'
                  : 'border-transparent text-brand-grey-1 hover:text-brand-black'
              )}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'map' && <MapTab trials={trials} />}
      {activeTab === 'summary' && (
        <SummaryTab
          trials={trials}
          totalClients={totalClients}
          totalSamples={totalSamples}
        />
      )}
    </div>
  )
}
