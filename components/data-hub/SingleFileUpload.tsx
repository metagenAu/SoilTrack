'use client'

import { useState } from 'react'
import { FileUp, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import ColumnReview from './ColumnReview'
import { cn } from '@/lib/utils'

const FILE_TYPES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'trialSummary', label: 'Trial Summary (.xlsx)' },
  { value: 'soilHealth', label: 'Soil Health Data (.csv)' },
  { value: 'soilChemistry', label: 'Soil Chemistry Data (.csv)' },
  { value: 'plotData', label: 'Plot Data (.csv)' },
  { value: 'tissueChemistry', label: 'Tissue Chemistry (.xlsx)' },
  { value: 'sampleMetadata', label: 'Assay Results (.csv)' },
]

interface UploadResult {
  status: 'success' | 'error' | 'needs_review'
  detail: string
  records?: number
  rawUploadId?: string
  unmappedColumns?: string[]
}

export default function SingleFileUpload({ trials }: { trials: { id: string; name: string }[] }) {
  const [selectedTrial, setSelectedTrial] = useState('')
  const [fileType, setFileType] = useState('auto')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  async function handleUpload() {
    if (!file || !selectedTrial) return
    setUploading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('trialId', selectedTrial)
    formData.append('fileType', fileType)

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120_000)

      const res = await fetch('/api/upload/single', {
        method: 'POST',
        body: formData,
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
        ? 'Upload timed out — the server took too long to respond'
        : (err?.message || 'Upload failed')
      setResult({ status: 'error', detail })
    }
    setUploading(false)
  }

  function handleReviewComplete(batchResults: { rawUploadId: string; status: string; records?: number; detail?: string }[]) {
    setReviewOpen(false)
    const first = batchResults[0]
    if (first) {
      setResult({
        status: first.status as 'success' | 'error',
        detail: first.detail || '',
        records: first.records,
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* Trial selector */}
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

      {/* File type selector */}
      <div>
        <label className="signpost-label block mb-1">FILE TYPE</label>
        <select
          value={fileType}
          onChange={(e) => setFileType(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
        >
          {FILE_TYPES.map((ft) => (
            <option key={ft.value} value={ft.value}>{ft.label}</option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0])
        }}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
          dragOver ? 'border-brand-black/30 bg-brand-grey-3' : 'border-brand-grey-2 hover:border-brand-grey-1'
        )}
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.csv,.xlsx,.xls'
          input.onchange = (e) => {
            const target = e.target as HTMLInputElement
            if (target.files?.[0]) setFile(target.files[0])
          }
          input.click()
        }}
      >
        <FileUp className="mx-auto mb-2 text-brand-grey-1" size={32} />
        <p className="text-sm text-brand-black">
          {file ? file.name : 'Drop a file here or click to browse'}
        </p>
      </div>

      <Button onClick={handleUpload} disabled={uploading || !file || !selectedTrial} className="w-full">
        {uploading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Processing...
          </>
        ) : (
          'Upload File'
        )}
      </Button>

      {result && (
        <div className={cn(
          'flex items-center gap-2 p-3 rounded-lg',
          result.status === 'success' ? 'bg-green-lush/10' :
          result.status === 'needs_review' ? 'bg-amber-50' : 'bg-red-50'
        )}>
          {result.status === 'success' && (
            <CheckCircle size={16} className="text-green-lush" />
          )}
          {result.status === 'needs_review' && (
            <AlertTriangle size={16} className="text-amber-600" />
          )}
          {result.status === 'error' && (
            <XCircle size={16} className="text-red-500" />
          )}
          <p className="text-sm">
            {result.detail}
            {result.records !== undefined && ` (${result.records} records)`}
          </p>
          {result.status === 'needs_review' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setReviewOpen(true)}
              className="ml-auto"
            >
              Review
            </Button>
          )}
        </div>
      )}

      {/* Column review modal */}
      {result?.rawUploadId && result?.unmappedColumns && (
        <ColumnReview
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          items={[{
            rawUploadId: result.rawUploadId,
            filename: file?.name || 'unknown',
            fileType: fileType === 'auto' ? 'plotData' : fileType,
            unmappedColumns: result.unmappedColumns,
          }]}
          onComplete={handleReviewComplete}
        />
      )}
    </div>
  )
}
