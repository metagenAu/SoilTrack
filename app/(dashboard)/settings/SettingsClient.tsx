'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Download, CheckCircle, XCircle } from 'lucide-react'

const EXPORT_TABLES = [
  { key: 'trials', label: 'Trials' },
  { key: 'treatments', label: 'Treatments' },
  { key: 'soil_health_samples', label: 'Soil Health Samples' },
  { key: 'soil_chemistry', label: 'Soil Chemistry' },
  { key: 'plot_data', label: 'Plot Data' },
  { key: 'tissue_chemistry', label: 'Tissue Chemistry' },
  { key: 'clients', label: 'Clients' },
  { key: 'management_log', label: 'Management Log' },
]

export default function SettingsClient({ user }: { user: any }) {
  const supabase = createClient()
  const [exporting, setExporting] = useState<string | null>(null)

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleExport(table: string) {
    setExporting(table)
    try {
      const res = await fetch(`/api/export?table=${encodeURIComponent(table)}`)
      if (!res.ok) throw new Error('Export failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${table}_export.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
    setExporting(null)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile */}
      <div className="card">
        <p className="signpost-label mb-3">PROFILE</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-brand-grey-1">Email</span>
            <span className="font-medium">{user?.email || 'Not signed in'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-grey-1">User ID</span>
            <span className="font-mono text-xs">{user?.id || '—'}</span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-brand-grey-2">
          <Button variant="secondary" size="sm" onClick={handleSignOut}>
            <LogOut size={14} />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Supabase connection */}
      <div className="card">
        <p className="signpost-label mb-3">SUPABASE CONNECTION</p>
        <div className="flex items-center gap-2 text-sm">
          {supabaseUrl ? (
            <>
              <CheckCircle size={14} className="text-green-lush" />
              <span>Connected to {supabaseUrl}</span>
            </>
          ) : (
            <>
              <XCircle size={14} className="text-red-500" />
              <span>Not configured</span>
            </>
          )}
        </div>
      </div>

      {/* Data Export */}
      <div className="card">
        <p className="signpost-label mb-3">DATA EXPORT</p>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_TABLES.map((t) => (
            <Button
              key={t.key}
              variant="secondary"
              size="sm"
              onClick={() => handleExport(t.key)}
              disabled={exporting === t.key}
              className="justify-start"
            >
              <Download size={12} />
              {exporting === t.key ? 'Exporting...' : t.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
