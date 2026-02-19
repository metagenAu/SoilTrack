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

    if (password.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }

    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter.')
      return
    }

    if (!/[a-z]/.test(password)) {
      setError('Password must contain at least one lowercase letter.')
      return
    }

    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number.')
      return
    }

    setLoading(true)
    const { error } = await getSupabase().auth.updateUser({ password })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Password updated successfully. Redirecting...')
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 1500)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-brand-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-lg bg-white/10 flex items-center justify-center mb-3">
            <span className="text-white font-semibold text-2xl">M</span>
          </div>
          <div className="text-white text-center">
            <span className="text-lg font-semibold">meta</span>
            <span className="text-lg font-light">gen</span>
            <sup className="text-xs ml-0.5 text-white/40">AUS</sup>
          </div>
          <span className="text-white/30 text-xs uppercase tracking-[2px] mt-1">SoilTrack</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl p-6">
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
                minLength={12}
                className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
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
                minLength={12}
                className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
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
