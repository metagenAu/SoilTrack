'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showResendConfirmation, setShowResendConfirmation] = useState(false)

  // Lazy-init: avoids calling createClient() during build-time prerender
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient()
    return supabaseRef.current
  }

  // Safety net: handle auth callback params that land on the login page.
  // The middleware should catch these, but this handles edge cases like
  // hash fragments (invisible to the server) or cached redirects.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // Show error messages forwarded from auth callback routes
    const urlError = params.get('error')
    if (urlError) {
      setError(urlError)
    }

    // Handle PKCE code param — redirect to the server callback route
    const code = params.get('code')
    if (code) {
      window.location.href = `/auth/callback${window.location.search}`
      return
    }

    // Handle hash fragment tokens (implicit flow / Supabase magic link fallback)
    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      // Supabase's createBrowserClient auto-detects hash fragments and
      // establishes a session. Listen for the resulting auth state change.
      const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          try {
            const payload = JSON.parse(atob(session.access_token.split('.')[1]))
            const isInvite = (payload.amr || []).some(
              (entry: { method: string }) => entry.method === 'invite'
            )
            window.location.href = isInvite ? '/reset-password' : '/'
          } catch {
            window.location.href = '/'
          }
        }
      })
      return () => subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResendConfirmation() {
    setLoading(true)
    setError('')
    setMessage('')
    const redirectTo = `${window.location.origin}/auth/callback`
    const { error } = await getSupabase().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Confirmation email resent. Please check your inbox.')
      setShowResendConfirmation(false)
    }
    setLoading(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    setShowResendConfirmation(false)

    if (mode === 'forgot') {
      const redirectTo = `${window.location.origin}/auth/callback?type=recovery`
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo,
      })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email for the password reset link.')
      }
      setLoading(false)
      return
    }

    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setError('Your email address has not been confirmed yet.')
        setShowResendConfirmation(true)
      } else {
        setError(error.message)
      }
    } else {
      window.location.href = '/dashboard'
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
            {mode === 'login' ? 'Sign in' : 'Reset password'}
          </h2>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="signpost-label block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
                placeholder="you@metagen.com.au"
              />
            </div>

            {mode === 'login' && (
              <div>
                <label className="signpost-label block mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-brand-grey-2 bg-brand-grey-3 text-sm text-brand-black focus:outline-none focus:border-brand-black/30"
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && (
              <p className="text-red-500 text-xs">{error}</p>
            )}
            {showResendConfirmation && (
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={loading}
                className="text-xs text-brand-black/50 hover:text-brand-black hover:underline"
              >
                Resend confirmation email
              </button>
            )}
            {message && (
              <p className="text-green-lush text-xs">{message}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? 'Loading...'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Send reset link'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            {mode === 'login' ? (
              <button
                onClick={() => { setMode('forgot'); setError(''); setMessage(''); setShowResendConfirmation(false) }}
                className="text-xs text-brand-black/50 hover:text-brand-black hover:underline"
              >
                Forgot password?
              </button>
            ) : (
              <button
                onClick={() => { setMode('login'); setError(''); setMessage(''); setShowResendConfirmation(false) }}
                className="text-xs text-brand-black/50 hover:text-brand-black hover:underline"
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
