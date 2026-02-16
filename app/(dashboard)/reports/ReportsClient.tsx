'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import ProductTag from '@/components/ui/ProductTag'
import StatusPill from '@/components/ui/StatusPill'
import { formatDate, getProductColor } from '@/lib/utils'
import { FileText, Loader2 } from 'lucide-react'

interface TrialReport {
  trial: any
  treatments: any[]
  samples: any[]
  yieldSummary: { product: string; avgYield: number }[]
}

export default function ReportsClient({ trials }: { trials: { id: string; name: string }[] }) {
  const [selectedTrial, setSelectedTrial] = useState('')
  const [report, setReport] = useState<TrialReport | null>(null)
  const [loading, setLoading] = useState(false)

  async function generateReport() {
    if (!selectedTrial) return
    setLoading(true)
    setReport(null)

    try {
      const res = await fetch(`/api/report?trialId=${encodeURIComponent(selectedTrial)}`)
      const data = await res.json()
      setReport(data)
    } catch {
      // Handle error silently
    }
    setLoading(false)
  }

  return (
    <div>
      <div className="card mb-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="signpost-label block mb-1">SELECT TRIAL</label>
            <select
              value={selectedTrial}
              onChange={(e) => setSelectedTrial(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
            >
              <option value="">Choose a trial...</option>
              {trials.map((t) => (
                <option key={t.id} value={t.id}>{t.id} — {t.name}</option>
              ))}
            </select>
          </div>
          <Button onClick={generateReport} disabled={!selectedTrial || loading}>
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText size={14} />
                Generate Report
              </>
            )}
          </Button>
        </div>
      </div>

      {report && (
        <div className="space-y-6">
          {/* Trial header */}
          <div className="card">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-lg font-semibold text-brand-black/60">{report.trial.id}</span>
              <StatusPill status={report.trial.status} />
            </div>
            <h2 className="text-lg font-bold text-brand-black mb-2">{report.trial.name}</h2>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-brand-grey-1">Grower</p>
                <p className="font-medium">{report.trial.grower || '—'}</p>
              </div>
              <div>
                <p className="text-brand-grey-1">Location</p>
                <p className="font-medium">{report.trial.location || '—'}</p>
              </div>
              <div>
                <p className="text-brand-grey-1">Crop</p>
                <p className="font-medium">{report.trial.crop || '—'}</p>
              </div>
              <div>
                <p className="text-brand-grey-1">Trial Type</p>
                <p className="font-medium">{report.trial.trial_type || '—'}</p>
              </div>
            </div>
          </div>

          {/* Treatments */}
          {report.treatments.length > 0 && (
            <div className="card">
              <p className="signpost-label mb-3">TREATMENTS</p>
              <div className="space-y-2">
                {report.treatments.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 text-sm">
                    <span className="font-mono w-8">{t.trt_number}</span>
                    <span className="flex-1">{t.application}</span>
                    {t.product && <ProductTag product={t.product} />}
                    <span className="font-mono text-brand-grey-1">{t.rate || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Soil samples */}
          {report.samples.length > 0 && (
            <div className="card">
              <p className="signpost-label mb-3">SOIL HEALTH SAMPLES ({report.samples.length})</p>
              <div className="space-y-1">
                {report.samples.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-3 text-sm">
                    <span className="font-mono">{s.sample_no}</span>
                    <span className="text-brand-grey-1">{formatDate(s.date)}</span>
                    <span className="text-brand-grey-1">{s.block}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Yield summary */}
          {report.yieldSummary.length > 0 && (
            <div className="card">
              <p className="signpost-label mb-3">YIELD SUMMARY BY TREATMENT</p>
              <div className="space-y-3">
                {report.yieldSummary.map((ys: any) => {
                  const maxYield = Math.max(...report.yieldSummary.map((y: any) => y.avgYield))
                  const widthPct = maxYield > 0 ? (ys.avgYield / maxYield) * 100 : 0
                  return (
                    <div key={ys.product}>
                      <div className="flex items-center justify-between mb-1">
                        <ProductTag product={ys.product} />
                        <span className="font-mono text-sm font-bold">{ys.avgYield.toFixed(2)} t/ha</span>
                      </div>
                      <div className="h-3 bg-brand-grey-3 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: getProductColor(ys.product),
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
