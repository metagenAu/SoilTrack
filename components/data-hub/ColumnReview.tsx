'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle, Loader2, ArrowRight, FileText } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

/** Available DB fields the user can map an unknown column to */
const TARGET_FIELDS: Record<string, { label: string; fields: { value: string; label: string }[] }> = {
  soilHealth: {
    label: 'Soil Health',
    fields: [
      { value: 'sample_no', label: 'Sample No' },
      { value: 'date', label: 'Date' },
      { value: 'property', label: 'Property' },
      { value: 'block', label: 'Block' },
      { value: 'barcode', label: 'Barcode' },
      { value: 'latitude', label: 'Latitude' },
      { value: 'longitude', label: 'Longitude' },
    ],
  },
  plotData: {
    label: 'Plot Data',
    fields: [
      { value: 'plot', label: 'Plot' },
      { value: 'trt_number', label: 'Treatment Number' },
      { value: 'rep', label: 'Rep' },
      { value: 'yield_t_ha', label: 'Yield (t/ha)' },
      { value: 'plant_count', label: 'Plant Count' },
      { value: 'vigour', label: 'Vigour' },
      { value: 'disease_score', label: 'Disease Score' },
    ],
  },
  soilChemistry: {
    label: 'Soil Chemistry',
    fields: [
      { value: 'sample_no', label: 'Sample No' },
      { value: 'date', label: 'Date' },
      { value: 'block', label: 'Block' },
      { value: '__metric__', label: 'Treat as metric (pivot)' },
    ],
  },
  tissueChemistry: {
    label: 'Tissue Chemistry',
    fields: [
      { value: 'sample_no', label: 'Sample No' },
      { value: 'date', label: 'Date' },
      { value: 'tissue_type', label: 'Tissue Type' },
      { value: '__metric__', label: 'Treat as metric (pivot)' },
    ],
  },
  sampleMetadata: {
    label: 'Sample Metadata',
    fields: [
      { value: 'sample_no', label: 'Sample No' },
      { value: 'date', label: 'Date' },
      { value: 'block', label: 'Block' },
      { value: 'treatment', label: 'Treatment' },
      { value: 'assay_type', label: 'Assay Type' },
      { value: '__metric__', label: 'Treat as metric (pivot)' },
    ],
  },
}

/** One file that needs column review */
export interface ReviewItem {
  rawUploadId: string
  filename: string
  fileType: string
  unmappedColumns: string[]
  sampleValues?: Record<string, string[]>
}

interface ColumnReviewProps {
  open: boolean
  onClose: () => void
  /** One or more files to review in a single modal flow */
  items: ReviewItem[]
  onComplete: (results: { rawUploadId: string; status: string; records?: number; detail?: string }[]) => void
}

export default function ColumnReview({
  open,
  onClose,
  items,
  onComplete,
}: ColumnReviewProps) {
  // Per-file mappings: { rawUploadId: { colName: dbField } }
  const [allMappings, setAllMappings] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {}
    for (const item of items) {
      init[item.rawUploadId] = {}
      for (const col of item.unmappedColumns) {
        init[item.rawUploadId][col] = '__skip__'
      }
    }
    return init
  })
  const [submitting, setSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  const currentItem = items[currentStep]
  const fieldOptions = currentItem ? (TARGET_FIELDS[currentItem.fileType]?.fields || []) : []
  const currentMappings = currentItem ? (allMappings[currentItem.rawUploadId] || {}) : {}
  const isLastStep = currentStep === items.length - 1

  function updateMapping(col: string, value: string) {
    if (!currentItem) return
    setAllMappings(prev => ({
      ...prev,
      [currentItem.rawUploadId]: {
        ...prev[currentItem.rawUploadId],
        [col]: value,
      },
    }))
  }

  async function handleSubmitAll() {
    setSubmitting(true)
    const results: { rawUploadId: string; status: string; records?: number; detail?: string }[] = []

    for (const item of items) {
      try {
        const res = await fetch('/api/upload/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawUploadId: item.rawUploadId,
            columnOverrides: allMappings[item.rawUploadId] || {},
          }),
        })
        const data = await res.json()
        results.push({ rawUploadId: item.rawUploadId, ...data })
      } catch {
        results.push({ rawUploadId: item.rawUploadId, status: 'error', detail: 'Failed to submit' })
      }
    }

    setSubmitting(false)
    onComplete(results)
  }

  if (!currentItem) return null

  return (
    <Modal open={open} onClose={onClose} title="Review Column Mappings" className="max-w-2xl">
      <div className="space-y-4">
        {/* Progress indicator for multi-file review */}
        {items.length > 1 && (
          <div className="flex items-center gap-2 pb-2 border-b border-brand-grey-2">
            {items.map((item, i) => (
              <button
                key={item.rawUploadId}
                onClick={() => setCurrentStep(i)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors',
                  i === currentStep
                    ? 'bg-meta-blue text-white'
                    : 'bg-brand-grey-3 text-brand-grey-1 hover:text-brand-black'
                )}
              >
                <FileText size={12} />
                <span className="max-w-[120px] truncate">{item.filename}</span>
              </button>
            ))}
          </div>
        )}

        {/* Current file info */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <span className="font-medium">{currentItem.filename}</span>
            {' — '}
            {currentItem.unmappedColumns.length} column{currentItem.unmappedColumns.length > 1 ? 's' : ''}{' '}
            couldn&apos;t be auto-matched.
            Map each to a database field or skip it.
          </div>
        </div>

        {/* Column mapping rows */}
        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {currentItem.unmappedColumns.map((col) => (
            <div key={col} className="flex items-center gap-3 p-3 rounded-lg bg-brand-grey-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-brand-black truncate">{col}</p>
                {currentItem.sampleValues?.[col] && (
                  <p className="text-xs text-brand-grey-1 truncate mt-0.5">
                    e.g. {currentItem.sampleValues[col].slice(0, 3).join(', ')}
                  </p>
                )}
              </div>

              <ArrowRight size={14} className="text-brand-grey-1 flex-shrink-0" />

              <select
                value={currentMappings[col] || '__skip__'}
                onChange={(e) => updateMapping(col, e.target.value)}
                className="w-48 px-2 py-1.5 rounded-lg border border-brand-grey-2 bg-white text-sm text-brand-black focus:outline-none focus:border-meta-blue"
              >
                <option value="__skip__">Skip (ignore)</option>
                {fieldOptions.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Navigation + submit */}
        <div className="flex items-center justify-between pt-2 border-t border-brand-grey-2">
          <div className="text-xs text-brand-grey-1">
            {items.length > 1 && `File ${currentStep + 1} of ${items.length}`}
          </div>
          <div className="flex gap-2">
            {items.length > 1 && currentStep > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep(s => s - 1)}>
                Previous
              </Button>
            )}
            {items.length > 1 && !isLastStep && (
              <Button variant="secondary" size="sm" onClick={() => setCurrentStep(s => s + 1)}>
                Next File
              </Button>
            )}
            {isLastStep && (
              <>
                <Button variant="secondary" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button onClick={handleSubmitAll} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Processing {items.length > 1 ? `${items.length} files` : ''}...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} />
                      Apply {items.length > 1 ? `All ${items.length} Mappings` : 'Mappings'}
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
