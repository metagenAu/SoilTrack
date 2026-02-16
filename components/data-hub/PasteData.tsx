'use client'

import { useState } from 'react'
import { ClipboardPaste, CheckCircle, XCircle, Loader2 } from 'lucide-react'
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

  async function handleImport() {
    if (!csvText.trim() || !selectedTrial) return
    setImporting(true)
    setResult(null)

    try {
      const res = await fetch('/api/upload/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trialId: selectedTrial,
          dataType,
          csvText: csvText.trim(),
        }),
      })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ status: 'error', detail: 'Import failed' })
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
          className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-meta-blue"
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
          className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-meta-blue"
        >
          {DATA_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>{dt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="signpost-label block mb-1">CSV DATA</label>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={10}
          placeholder="Paste your CSV data here (including headers)..."
          className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm font-mono text-brand-black focus:outline-none focus:border-meta-blue resize-none"
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
