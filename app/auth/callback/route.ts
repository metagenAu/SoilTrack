import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  const supabase = createServerSupabaseClient()

  // Handle PKCE code exchange (magic links, OAuth, invitations with PKCE)
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // With PKCE the type param is not forwarded, so check the JWT's AMR
      // (Authentication Methods Reference) to detect invite acceptance
      let isInvite = type === 'invite'
      if (!isInvite && data.session) {
        try {
          const payload = JSON.parse(
            Buffer.from(data.session.access_token.split('.')[1], 'base64').toString()
          )
          isInvite = (payload.amr || []).some((entry: { method: string }) => entry.method === 'invite')
        } catch {
          // JWT parsing failed — fall through to default redirect
        }
      }
      return NextResponse.redirect(`${origin}${isInvite ? '/reset-password' : next}`)
    }
  }

  // Handle token hash verification (invitations, email confirmations)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(`${origin}${type === 'invite' ? '/reset-password' : next}`)
    }
  }

  // If both methods fail, redirect to login with an error
  return NextResponse.redirect(`${origin}/login`)
}
