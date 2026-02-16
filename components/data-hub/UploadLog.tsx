import { formatDate } from '@/lib/utils'
import { CheckCircle, XCircle, FileText } from 'lucide-react'

interface LogEntry {
  id: string
  trial_id: string | null
  filename: string | null
  file_type: string | null
  status: string
  detail: string | null
  records_imported: number
  created_at: string
}

interface UploadLogProps {
  entries: LogEntry[]
}

export default function UploadLog({ entries }: UploadLogProps) {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-brand-grey-1 text-center py-4">No uploads yet.</p>
    )
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {entries.map((e) => (
        <div key={e.id} className="flex items-start gap-2 px-2 py-1.5">
          {e.status === 'success' ? (
            <CheckCircle size={14} className="text-green-lush mt-0.5 flex-shrink-0" />
          ) : (
            <XCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs text-brand-black truncate">{e.filename || 'Unknown file'}</p>
            <p className="text-[10px] text-brand-grey-1">
              {e.trial_id && <span className="font-mono">{e.trial_id}</span>}
              {e.file_type && <span> · {e.file_type}</span>}
              {e.records_imported > 0 && <span> · {e.records_imported} records</span>}
              <span> · {formatDate(e.created_at)}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
