'use client'

import { useState } from 'react'
import { FileUp, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const FILE_TYPES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'trialSummary', label: 'Trial Summary (.xlsx)' },
  { value: 'soilHealth', label: 'Soil Health Data (.csv)' },
  { value: 'soilChemistry', label: 'Soil Chemistry Data (.csv)' },
  { value: 'plotData', label: 'Plot Data (.csv)' },
  { value: 'tissueChemistry', label: 'Tissue Chemistry (.xlsx)' },
  { value: 'sampleMetadata', label: 'Sample Metadata (.csv)' },
]

interface UploadResult {
  status: 'success' | 'error'
  detail: string
  records?: number
}

export default function SingleFileUpload({ trials }: { trials: { id: string; name: string }[] }) {
  const [selectedTrial, setSelectedTrial] = useState('')
  const [fileType, setFileType] = useState('auto')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  async function handleUpload() {
    if (!file || !selectedTrial) return
    setUploading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('trialId', selectedTrial)
    formData.append('fileType', fileType)

    try {
      const res = await fetch('/api/upload/single', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ status: 'error', detail: 'Upload failed' })
    }
    setUploading(false)
  }

  return (
    <div className="space-y-4">
      {/* Trial selector */}
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

      {/* File type selector */}
      <div>
        <label className="signpost-label block mb-1">FILE TYPE</label>
        <select
          value={fileType}
          onChange={(e) => setFileType(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-meta-blue"
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
          dragOver ? 'border-meta-blue bg-meta-blue/5' : 'border-brand-grey-2 hover:border-meta-blue/50'
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
