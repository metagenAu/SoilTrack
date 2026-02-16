import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'

  if (token_hash && type) {
    const cookieStore = cookies()

    // Collect cookies that the Supabase SDK sets during OTP verification
    // so we can attach them to the redirect response.
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
      // Redirect invited / recovery users to set their password
      let needsPasswordPage = type === 'invite' || type === 'recovery'

      if (!needsPasswordPage) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            const payload = JSON.parse(
              Buffer.from(session.access_token.split('.')[1], 'base64').toString()
            )
            needsPasswordPage = (payload.amr || []).some(
              (entry: { method: string }) => entry.method === 'invite'
            )
          }
        } catch {
          // Fall through to default redirect
        }
      }

      const destination = needsPasswordPage ? '/reset-password' : next
      const response = NextResponse.redirect(`${origin}${destination}`)

      for (const { name, value, options } of pendingCookies) {
        response.cookies.set(name, value, options as Record<string, string>)
      }

      return response
    }

    const msg = error.message || 'Could not verify invitation'
    console.error('[auth/confirm] OTP verification failed:', error.message, error.status)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`
    )
  }

  // No token_hash or type — nothing to verify
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Missing verification parameters')}`)
}
