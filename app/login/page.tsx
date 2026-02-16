'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup' | 'magic'>('login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({ email })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email for the magic link.')
      }
      setLoading(false)
      return
    }

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email to confirm your account.')
      }
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      window.location.href = '/'
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
            {mode === 'login' && 'Sign in'}
            {mode === 'signup' && 'Create account'}
            {mode === 'magic' && 'Magic link'}
          </h2>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="signpost-label block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-meta-blue"
                placeholder="you@metagen.com.au"
              />
            </div>

            {mode !== 'magic' && (
              <div>
                <label className="signpost-label block mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-meta-blue"
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && (
              <p className="text-red-500 text-xs">{error}</p>
            )}
            {message && (
              <p className="text-green-lush text-xs">{message}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Loading...' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send magic link'}
            </Button>
          </form>

          <div className="mt-4 text-center space-y-1">
            {mode !== 'login' && (
              <button
                onClick={() => setMode('login')}
                className="text-xs text-meta-blue hover:underline block mx-auto"
              >
                Sign in with password
              </button>
            )}
            {mode !== 'signup' && (
              <button
                onClick={() => setMode('signup')}
                className="text-xs text-meta-blue hover:underline block mx-auto"
              >
                Create account
              </button>
            )}
            {mode !== 'magic' && (
              <button
                onClick={() => setMode('magic')}
                className="text-xs text-meta-blue hover:underline block mx-auto"
              >
                Use magic link instead
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
