'use client'

import { useState, useCallback, useMemo } from 'react'
import { FolderUp, FileText, CheckCircle, XCircle, Loader2, Clock, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import ColumnReview, { type ReviewItem } from './ColumnReview'
import { cn } from '@/lib/utils'
import { classifyFile, type FileClassification } from '@/lib/parsers/classify'

interface FileResult {
  filename: string
  type: string
  status: 'success' | 'error' | 'processing' | 'pending' | 'needs_review'
  detail?: string
  records?: number
  rawUploadId?: string
  unmappedColumns?: string[]
}

const TYPE_LABELS: Record<FileClassification, string> = {
  trialSummary: 'Trial Summary',
  soilHealth: 'Soil Health',
  soilChemistry: 'Soil Chemistry',
  plotData: 'Plot Data',
  tissueChemistry: 'Tissue Chemistry',
  sampleMetadata: 'Assay Results',
  photo: 'Photo',
  unknown: 'Unknown',
}

const IGNORED_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', '.gitkeep'])

function isHiddenOrSystem(name: string): boolean {
  const base = name.split('/').pop() || name
  if (base.startsWith('.')) return true
  if (IGNORED_FILES.has(base.toLowerCase())) return true
  return false
}

/** Recursively read all files from a dropped directory via DataTransfer items */
async function readEntriesRecursively(
  dirReader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = []
  let batch: FileSystemEntry[]
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      dirReader.readEntries(resolve, reject)
    )
    entries.push(...batch)
  } while (batch.length > 0)
  return entries
}

async function getAllFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    )
    return [file]
  }
  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader()
    const children = await readEntriesRecursively(dirReader)
    const nested = await Promise.all(children.map(getAllFilesFromEntry))
    return nested.flat()
  }
  return []
}

async function getFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const files: File[] = []
  const items = dataTransfer.items

  // Try the modern webkitGetAsEntry API to handle directories
  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
    const entries: FileSystemEntry[] = []
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry()
      if (entry) entries.push(entry)
    }
    const nested = await Promise.all(entries.map(getAllFilesFromEntry))
    files.push(...nested.flat())
  } else {
    // Fallback: use dataTransfer.files directly (won't traverse directories)
    files.push(...Array.from(dataTransfer.files))
  }

  // Filter out hidden/system files and zero-byte directory stubs
  return files.filter(f => f.size > 0 && !isHiddenOrSystem(f.name))
}

export default function FolderUpload() {
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<FileResult[]>([])
  const [uploading, setUploading] = useState(false)
  const [trialId, setTrialId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewStartIndex, setReviewStartIndex] = useState(0)

  const handleFiles = useCallback((fileArr: File[]) => {
    // Sort so trial summary comes first (needed for processing order)
    const sorted = [...fileArr].sort((a, b) => {
      const aType = classifyFile(a.name)
      const bType = classifyFile(b.name)
      if (aType === 'trialSummary') return -1
      if (bType === 'trialSummary') return 1
      return 0
    })
    setFiles(sorted)
    setResults(sorted.map(f => ({
      filename: f.name,
      type: TYPE_LABELS[classifyFile(f.name)],
      status: 'pending' as const,
    })))
  }, [])

  async function handleUpload() {
    if (files.length === 0) return
    setUploading(true)
    setTrialId(null)
    setResults(prev => prev.map(r => ({ ...r, status: 'pending' as const, detail: undefined, records: undefined })))

    // Classify files into three groups: unknown (skip), data files, photos
    const unknownIndices: number[] = []
    const dataFileIndices: number[] = []
    const photoIndices: number[] = []

    for (let i = 0; i < files.length; i++) {
      const classification = classifyFile(files[i].name)
      if (classification === 'unknown') {
        unknownIndices.push(i)
      } else if (classification === 'photo') {
        photoIndices.push(i)
      } else {
        dataFileIndices.push(i)
      }
    }

    // Mark unknowns as skipped immediately
    for (const i of unknownIndices) {
      setResults(prev => prev.map((r, idx) =>
        idx === i ? { ...r, status: 'success' as const, detail: 'Skipped — not a recognised data file' } : r
      ))
    }

    // --- Step 1: Upload data files (CSVs / XLSX) in one small batch ---
    // Use a local variable so the trialId is available immediately for Step 2
    let returnedTrialId: string | null = null

    if (dataFileIndices.length > 0) {
      const formData = new FormData()
      for (const i of dataFileIndices) formData.append('files', files[i])

      setResults(prev => prev.map((r, idx) =>
        dataFileIndices.includes(idx) ? { ...r, status: 'processing' as const } : r
      ))

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120_000)

        const res = await fetch('/api/upload/folder', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })

        clearTimeout(timeout)

        if (!res.ok) {
          let detail = `Server error (${res.status})`
          try {
            const body = await res.json()
            if (body?.error) detail = body.error
          } catch { /* body wasn't JSON */ }
          throw new Error(detail)
        }

        const data = await res.json()
        if (data.trialId) {
          returnedTrialId = data.trialId
          setTrialId(data.trialId)
        }

        // Map server results back to UI — try by filename first, fall back to order
        const serverResults: FileResult[] = data.results || []
        const resultsByName = new Map<string, FileResult>()
        for (const r of serverResults) {
          resultsByName.set(r.filename, r)
        }

        setResults(prev => {
          const updated = prev.map((r, idx) => {
            if (!dataFileIndices.includes(idx)) return r

            const serverResult = resultsByName.get(r.filename)
            if (serverResult) {
              return {
                ...r,
                status: serverResult.status as FileResult['status'],
                detail: serverResult.detail,
                records: serverResult.records,
                rawUploadId: serverResult.rawUploadId,
                unmappedColumns: serverResult.unmappedColumns,
              }
            }

            const dataIdx = dataFileIndices.indexOf(idx)
            if (dataIdx >= 0 && dataIdx < serverResults.length) {
              const sr = serverResults[dataIdx]
              return {
                ...r,
                status: sr.status as FileResult['status'],
                detail: sr.detail,
                records: sr.records,
                rawUploadId: sr.rawUploadId,
                unmappedColumns: sr.unmappedColumns,
              }
            }

            return r
          })

          // Safety sweep: force any files still stuck in 'processing' to error
          return updated.map(r =>
            r.status === 'processing'
              ? { ...r, status: 'error' as const, detail: 'No response received from server' }
              : r
          )
        })
      } catch (err: any) {
        const detail = err?.name === 'AbortError'
          ? 'Upload timed out — the server took too long to respond'
          : (err?.message || 'Upload failed')

        setResults(prev => prev.map((r, idx) =>
          dataFileIndices.includes(idx) ? { ...r, status: 'error' as const, detail } : r
        ))
      }
    }

    // --- Step 2: Upload each photo individually with trialId ---
    if (photoIndices.length > 0) {
      if (!returnedTrialId) {
        // No trial context — mark all photos as error
        setResults(prev => prev.map((r, idx) =>
          photoIndices.includes(idx)
            ? { ...r, status: 'error' as const, detail: 'No trial context — upload a Trial Summary first' }
            : r
        ))
      } else {
        for (const i of photoIndices) {
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'processing' as const } : r
          ))

          try {
            const photoForm = new FormData()
            photoForm.append('files', files[i])
            photoForm.append('trialId', returnedTrialId)

            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 120_000)

            const res = await fetch('/api/upload/folder', {
              method: 'POST',
              body: photoForm,
              signal: controller.signal,
            })

            clearTimeout(timeout)

            if (!res.ok) {
              let detail = `Server error (${res.status})`
              try {
                const body = await res.json()
                if (body?.error) detail = body.error
              } catch { /* body wasn't JSON */ }
              throw new Error(detail)
            }

            const data = await res.json()
            const sr = (data.results || [])[0]

            setResults(prev => prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: (sr?.status || 'error') as FileResult['status'],
                    detail: sr?.detail || 'Photo uploaded',
                    records: sr?.records,
                  }
                : r
            ))
          } catch (err: any) {
            const detail = err?.name === 'AbortError'
              ? 'Upload timed out — the server took too long to respond'
              : (err?.message || 'Photo upload failed')

            setResults(prev => prev.map((r, idx) =>
              idx === i ? { ...r, status: 'error' as const, detail } : r
            ))
          }
        }
      }
    }

    setUploading(false)
  }

  /** All needs_review results as ReviewItem[] for the batch modal */
  const reviewItems = useMemo<ReviewItem[]>(() =>
    results
      .filter(r => r.status === 'needs_review' && r.rawUploadId && r.unmappedColumns)
      .map(r => ({
        rawUploadId: r.rawUploadId!,
        filename: r.filename,
        fileType: r.type === 'Plot Data' ? 'plotData' :
                  r.type === 'Soil Health' ? 'soilHealth' :
                  r.type === 'Soil Chemistry' ? 'soilChemistry' :
                  r.type === 'Tissue Chemistry' ? 'tissueChemistry' :
                  r.type === 'Assay Results' ? 'sampleMetadata' :
                  r.type,
        unmappedColumns: r.unmappedColumns!,
      })),
    [results]
  )

  function handleReviewComplete(batchResults: { rawUploadId: string; status: string; records?: number; detail?: string }[]) {
    const resultMap = new Map(batchResults.map(r => [r.rawUploadId, r]))
    setResults(prev => prev.map(r => {
      if (r.rawUploadId && resultMap.has(r.rawUploadId)) {
        const br = resultMap.get(r.rawUploadId)!
        return { ...r, status: br.status as FileResult['status'], detail: br.detail, records: br.records }
      }
      return r
    }))
    setReviewOpen(false)
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setDragOver(false)
          const extracted = await getFilesFromDataTransfer(e.dataTransfer)
          if (extracted.length > 0) handleFiles(extracted)
        }}
        className={cn(
          'border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer',
          dragOver ? 'border-brand-black/30 bg-brand-grey-3' : 'border-brand-grey-2 hover:border-brand-grey-1'
        )}
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.multiple = true
          input.webkitdirectory = true
          input.onchange = (e) => {
            const target = e.target as HTMLInputElement
            if (target.files) {
              const filtered = Array.from(target.files).filter(
                f => f.size > 0 && !isHiddenOrSystem(f.name)
              )
              handleFiles(filtered)
            }
          }
          input.click()
        }}
      >
        <FolderUp className="mx-auto mb-3 text-brand-grey-1" size={40} />
        <p className="text-sm font-medium text-brand-black mb-1">
          Drop a trial folder here or click to browse
        </p>
        <p className="text-xs text-brand-grey-1">
          Expected: Trial Summary.xlsx, Soil Health Data.csv, Soil Chemistry Data.csv, Plot Data.csv
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="signpost-label">{files.length} FILES DETECTED</p>
            <Button onClick={handleUpload} disabled={uploading} size="sm">
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Processing...
                </>
              ) : (
                'Upload & Process'
              )}
            </Button>
          </div>

          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-brand-grey-3">
                {r.status === 'success' && <CheckCircle size={16} className="text-green-lush flex-shrink-0" />}
                {r.status === 'error' && <XCircle size={16} className="text-red-500 flex-shrink-0" />}
                {r.status === 'processing' && <Loader2 size={16} className="text-brand-black/50 animate-spin flex-shrink-0" />}
                {r.status === 'pending' && <Clock size={16} className="text-brand-grey-1 flex-shrink-0" />}
                {r.status === 'needs_review' && <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />}
                <FileText size={14} className="text-brand-grey-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-brand-black truncate">{r.filename}</p>
                  <p className={cn('text-xs', r.status === 'error' ? 'text-red-500' : 'text-brand-grey-1')}>
                    {r.type}{r.records !== undefined ? ` — ${r.records} records imported` : ''}
                    {r.detail ? ` — ${r.detail}` : ''}
                  </p>
                </div>
                {r.status === 'needs_review' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const idx = reviewItems.findIndex(item => item.rawUploadId === r.rawUploadId)
                      setReviewStartIndex(idx >= 0 ? idx : 0)
                      setReviewOpen(true)
                    }}
                  >
                    Review
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Batch review banner */}
          {reviewItems.length > 0 && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800 flex-1">
                {reviewItems.length} file{reviewItems.length > 1 ? 's' : ''} need column mapping review
              </p>
              <Button size="sm" onClick={() => { setReviewStartIndex(0); setReviewOpen(true) }}>
                Review All
              </Button>
            </div>
          )}

          {trialId && (
            <div className="mt-4 p-3 rounded-lg bg-green-lush/10 border border-green-lush/20">
              <p className="text-sm text-green-lush font-medium">
                Trial created:{' '}
                <a href={`/trials/${encodeURIComponent(trialId)}`} className="underline">
                  {trialId}
                </a>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Column review modal — batch mode for all needs_review files */}
      {reviewOpen && reviewItems.length > 0 && (
        <ColumnReview
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          items={reviewItems}
          initialStep={reviewStartIndex}
          onComplete={handleReviewComplete}
        />
      )}
    </div>
  )
}
