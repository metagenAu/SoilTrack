'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle, Loader2, ArrowRight } from 'lucide-react'
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

interface ColumnReviewProps {
  open: boolean
  onClose: () => void
  rawUploadId: string
  fileType: string
  unmappedColumns: string[]
  /** Preview data: first few values for each unmapped column */
  sampleValues?: Record<string, string[]>
  onComplete: (result: { status: string; records?: number; detail?: string }) => void
}

export default function ColumnReview({
  open,
  onClose,
  rawUploadId,
  fileType,
  unmappedColumns,
  sampleValues,
  onComplete,
}: ColumnReviewProps) {
  const [mappings, setMappings] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const col of unmappedColumns) {
      init[col] = '__skip__'
    }
    return init
  })
  const [submitting, setSubmitting] = useState(false)

  const fieldOptions = TARGET_FIELDS[fileType]?.fields || []

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/upload/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawUploadId,
          columnOverrides: mappings,
        }),
      })
      const data = await res.json()
      onComplete(data)
    } catch {
      onComplete({ status: 'error', detail: 'Failed to submit column mappings' })
    }
    setSubmitting(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Review Column Mappings" className="max-w-2xl">
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            {unmappedColumns.length} column{unmappedColumns.length > 1 ? 's' : ''} in your file
            {unmappedColumns.length > 1 ? " couldn't" : " couldn't"} be auto-matched.
            Map each column to a database field or skip it.
          </p>
        </div>

        <div className="space-y-3">
          {unmappedColumns.map((col) => (
            <div key={col} className="flex items-center gap-3 p-3 rounded-lg bg-brand-grey-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-brand-black truncate">{col}</p>
                {sampleValues?.[col] && (
                  <p className="text-xs text-brand-grey-1 truncate mt-0.5">
                    e.g. {sampleValues[col].slice(0, 3).join(', ')}
                  </p>
                )}
              </div>

              <ArrowRight size={14} className="text-brand-grey-1 flex-shrink-0" />

              <select
                value={mappings[col] || '__skip__'}
                onChange={(e) => setMappings(prev => ({ ...prev, [col]: e.target.value }))}
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

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle size={14} />
                Apply Mappings
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
