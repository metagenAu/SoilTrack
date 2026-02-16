'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Lazy-init: avoids calling createClient() during build-time prerender
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient()
    return supabaseRef.current
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const { error } = await getSupabase().auth.updateUser({ password })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Password updated successfully. Redirecting...')
      setTimeout(() => {
        window.location.href = '/'
      }, 1500)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-meta-blue flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-3">
            <span className="text-meta-blue font-bold text-2xl">M</span>
          </div>
          <div className="text-white text-center">
            <span className="text-lg font-bold">meta</span>
            <span className="text-lg font-normal">gen</span>
            <sup className="text-xs ml-0.5">AUS</sup>
          </div>
          <span className="text-white/60 text-xs uppercase tracking-[2px] mt-1">SoilTrack</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-brand-black mb-4 text-center">
            Set new password
          </h2>

          <form onSubmit={handleReset} className="space-y-3">
            <div>
              <label className="signpost-label block mb-1">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-meta-blue"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="signpost-label block mb-1">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-meta-blue"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-500 text-xs">{error}</p>
            )}
            {message && (
              <p className="text-green-lush text-xs">{message}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Updating...' : 'Update password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
