import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'
import { validateRedirectPath } from '@/lib/api-utils'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = validateRedirectPath(searchParams.get('next') ?? '/dashboard')

  const cookieStore = cookies()

  // Handle PKCE code exchange (magic links, OAuth, invitations with PKCE)
  if (code) {
    // Determine redirect destination before creating response.
    // We need the Supabase client to exchange the code first, then
    // decide where to redirect based on whether this is an invite or
    // recovery flow. Build a *temporary* client to perform the exchange,
    // then create the final redirect response with cookies attached.

    // Collect cookies that the Supabase SDK wants to set during
    // exchangeCodeForSession so we can replay them onto the redirect.
    const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach((c) => pendingCookies.push(c))
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Detect invite or recovery to redirect to set-password page
      let needsPasswordPage = type === 'invite' || type === 'recovery'

      if (!needsPasswordPage && data.session) {
        try {
          const payload = JSON.parse(
            Buffer.from(data.session.access_token.split('.')[1], 'base64').toString()
          )
          needsPasswordPage = (payload.amr || []).some(
            (entry: { method: string }) => entry.method === 'invite'
          )
        } catch {
          // JWT parsing failed — fall through to default redirect
        }
      }

      const destination = needsPasswordPage ? '/reset-password' : next
      const response = NextResponse.redirect(`${origin}${destination}`)

      // Attach session cookies to the redirect response
      for (const { name, value, options } of pendingCookies) {
        response.cookies.set(name, value, options as Record<string, string>)
      }

      return response
    }

    // Code exchange failed — provide a meaningful error
    const msg = error.message || 'Invalid or expired link'
    console.error('[auth/callback] Code exchange failed:', error.message, error.status)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`
    )
  }

  // Handle token hash verification (invitations, email confirmations)
  if (token_hash && type) {
    const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach((c) => pendingCookies.push(c))
          },
        },
      }
    )

    const { error } = await supabase.auth.verifyOtp({ token_hash, type })

    if (!error) {
      const needsPasswordPage = type === 'invite' || type === 'recovery'
      const destination = needsPasswordPage ? '/reset-password' : next
      const response = NextResponse.redirect(`${origin}${destination}`)

      for (const { name, value, options } of pendingCookies) {
        response.cookies.set(name, value, options as Record<string, string>)
      }

      return response
    }

    const msg = error.message || 'Invalid or expired link'
    console.error('[auth/callback] OTP verification failed:', error.message, error.status)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`
    )
  }

  // No code or token_hash — nothing to process
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Missing authentication parameters')}`)
}
