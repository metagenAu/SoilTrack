'use client'

import { useState, useEffect } from 'react'
import { ClipboardPaste, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const DATA_TYPES = [
  { value: 'soilHealth', label: 'Soil Health' },
  { value: 'soilChemistry', label: 'Soil Chemistry' },
  { value: 'plotData', label: 'Plot Data' },
  { value: 'tissueChemistry', label: 'Tissue Chemistry' },
  { value: 'sampleMetadata', label: 'Assay Results' },
]

interface PasteResult {
  status: 'success' | 'error'
  detail: string
  records?: number
}

export default function PasteData({ trials }: { trials: { id: string; name: string }[] }) {
  const [selectedTrial, setSelectedTrial] = useState('')
  const [dataType, setDataType] = useState('soilHealth')
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<PasteResult | null>(null)
  const [existingTypes, setExistingTypes] = useState<string[]>([])

  // Check which data types already have data for the selected trial
  useEffect(() => {
    if (!selectedTrial) {
      setExistingTypes([])
      return
    }
    let cancelled = false
    fetch(`/api/upload/check-existing?trialId=${encodeURIComponent(selectedTrial)}`)
      .then(res => res.json())
      .then(data => { if (!cancelled) setExistingTypes(data.fileTypes || []) })
      .catch(() => { if (!cancelled) setExistingTypes([]) })
    return () => { cancelled = true }
  }, [selectedTrial])

  const hasExistingData = existingTypes.includes(dataType)

  async function handleImport() {
    if (!csvText.trim() || !selectedTrial) return
    setImporting(true)
    setResult(null)

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120_000)

      const res = await fetch('/api/upload/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trialId: selectedTrial,
          dataType,
          csvText: csvText.trim(),
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!res.ok) {
        let detail = `Server error (${res.status})`
        try {
          const body = await res.json()
          if (body?.detail) detail = body.detail
          else if (body?.error) detail = body.error
        } catch { /* body wasn't JSON */ }
        throw new Error(detail)
      }

      const data = await res.json()
      setResult(data)
    } catch (err: any) {
      const detail = err?.name === 'AbortError'
        ? 'Import timed out — the server took too long to respond'
        : (err?.message || 'Import failed')
      setResult({ status: 'error', detail })
    }
    setImporting(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="signpost-label block mb-1">TARGET TRIAL</label>
        <select
          value={selectedTrial}
          onChange={(e) => setSelectedTrial(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
        >
          <option value="">Select a trial...</option>
          {trials.map((t) => (
            <option key={t.id} value={t.id}>{t.id} — {t.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="signpost-label block mb-1">DATA TYPE</label>
        <select
          value={dataType}
          onChange={(e) => setDataType(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
        >
          {DATA_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>{dt.label}</option>
          ))}
        </select>
      </div>

      {/* Existing data warning */}
      {hasExistingData && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">This trial already has {DATA_TYPES.find(dt => dt.value === dataType)?.label || dataType} data</p>
            <p className="mt-0.5 text-xs">Matching rows will be updated with new values. New rows will be added. Existing rows not in this import will be kept.</p>
          </div>
        </div>
      )}

      <div>
        <label className="signpost-label block mb-1">CSV DATA</label>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={10}
          placeholder="Paste your CSV data here (including headers)..."
          className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm font-mono text-brand-black focus:outline-none focus:border-brand-black/30 resize-none"
        />
      </div>

      <Button onClick={handleImport} disabled={importing || !csvText.trim() || !selectedTrial} className="w-full">
        {importing ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Importing...
          </>
        ) : (
          <>
            <ClipboardPaste size={14} />
            Import Data
          </>
        )}
      </Button>

      {result && (
        <div className={cn(
          'flex items-center gap-2 p-3 rounded-lg',
          result.status === 'success' ? 'bg-green-lush/10' : 'bg-red-50'
        )}>
          {result.status === 'success' ? (
            <CheckCircle size={16} className="text-green-lush" />
          ) : (
            <XCircle size={16} className="text-red-500" />
          )}
          <p className="text-sm">
            {result.detail}
            {result.records !== undefined && ` (${result.records} records)`}
          </p>
        </div>
      )}
    </div>
  )
}
