'use client'

import { useState, useCallback } from 'react'
import { FolderUp, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface FileResult {
  filename: string
  type: string
  status: 'success' | 'error' | 'processing'
  detail?: string
  records?: number
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
    setFiles(fileArr)
    setResults(fileArr.map(f => ({ filename: f.name, type: 'detecting...', status: 'processing' as const })))
  }, [])

  async function handleUpload() {
    if (files.length === 0) return
    setUploading(true)

    const formData = new FormData()
    for (const f of files) {
      formData.append('files', f)
    }

    try {
      const res = await fetch('/api/upload/folder', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      setResults(data.results || [])
      if (data.trialId) setTrialId(data.trialId)
    } catch {
      setResults(files.map(f => ({
        filename: f.name,
        type: 'unknown',
        status: 'error' as const,
        detail: 'Upload failed',
      })))
    }
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
