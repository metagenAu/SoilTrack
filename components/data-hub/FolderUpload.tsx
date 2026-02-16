'use client'

import { useState, useCallback } from 'react'
import { FolderUp, FileText, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { classifyFile, type FileClassification } from '@/lib/parsers/classify'

interface FileResult {
  filename: string
  type: string
  status: 'success' | 'error' | 'processing' | 'pending'
  detail?: string
  records?: number
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
    setResults(prev => prev.map(r => ({ ...r, status: 'pending' as const })))

    let currentTrialId: string | null = null

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const classification = classifyFile(file.name)

      // Mark current file as processing
      setResults(prev => prev.map((r, idx) =>
        idx === i ? { ...r, status: 'processing' as const } : r
      ))

      try {
        if (classification === 'trialSummary') {
          // Upload trial summary via folder route to create/upsert the trial
          const formData = new FormData()
          formData.append('files', file)

          const res = await fetch('/api/upload/folder', {
            method: 'POST',
            body: formData,
          })

          if (!res.ok) throw new Error(`Server error (${res.status})`)

          const data = await res.json()
          if (data.trialId) currentTrialId = data.trialId

          const result = data.results?.[0]
          setResults(prev => prev.map((r, idx) =>
            idx === i ? {
              ...r,
              status: result?.status || 'success',
              detail: result?.detail,
              records: result?.records,
            } : r
          ))

        } else if (classification === 'photo' || classification === 'unknown') {
          setResults(prev => prev.map((r, idx) =>
            idx === i ? {
              ...r,
              status: 'success' as const,
              detail: classification === 'photo'
                ? 'Skipped (photo storage not yet configured)'
                : 'Skipped — not a recognised data file',
            } : r
          ))

        } else {
          if (!currentTrialId) {
            setResults(prev => prev.map((r, idx) =>
              idx === i ? {
                ...r,
                status: 'error' as const,
                detail: 'No trial context — include a Trial Summary file',
              } : r
            ))
            continue
          }

          const formData = new FormData()
          formData.append('file', file)
          formData.append('trialId', currentTrialId)
          formData.append('fileType', 'auto')

          const res = await fetch('/api/upload/single', {
            method: 'POST',
            body: formData,
          })

          if (!res.ok) throw new Error(`Server error (${res.status})`)

          const data = await res.json()
          setResults(prev => prev.map((r, idx) =>
            idx === i ? {
              ...r,
              status: data.status || 'success',
              detail: data.detail,
              records: data.records,
            } : r
          ))
        }
      } catch (err: any) {
        setResults(prev => prev.map((r, idx) =>
          idx === i ? {
            ...r,
            status: 'error' as const,
            detail: err?.message || 'Upload failed',
          } : r
        ))
      }
    }

    if (currentTrialId) setTrialId(currentTrialId)
    setUploading(false)
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
          dragOver ? 'border-meta-blue bg-meta-blue/5' : 'border-brand-grey-2 hover:border-meta-blue/50'
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
                {r.status === 'processing' && <Loader2 size={16} className="text-meta-blue animate-spin flex-shrink-0" />}
                {r.status === 'pending' && <Clock size={16} className="text-brand-grey-1 flex-shrink-0" />}
                <FileText size={14} className="text-brand-grey-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-brand-black truncate">{r.filename}</p>
                  <p className="text-xs text-brand-grey-1">
                    {r.type}{r.records !== undefined ? ` — ${r.records} records imported` : ''}
                    {r.detail ? ` — ${r.detail}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>

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
    </div>
  )
}
