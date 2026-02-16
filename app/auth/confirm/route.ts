import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  if (token_hash && type) {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })

    if (!error) {
      // Redirect invited users to set up their password
      let isInvite = type === 'invite'
      if (!isInvite) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            const payload = JSON.parse(
              Buffer.from(session.access_token.split('.')[1], 'base64').toString()
            )
            isInvite = (payload.amr || []).some((entry: { method: string }) => entry.method === 'invite')
          }
        } catch {
          // Fall through to default redirect
        }
      }
      return NextResponse.redirect(`${origin}${isInvite ? '/reset-password' : next}`)
    }
  }

  // If verification fails, redirect to login with an error
  return NextResponse.redirect(`${origin}/login?error=Could+not+verify+invitation`)
}
