import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  // Invited users should set up their password before accessing the app
  const redirectTo = type === 'invite' ? '/reset-password' : next

  const supabase = createServerSupabaseClient()

  // Handle PKCE code exchange (magic links, OAuth, invitations with PKCE)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // Handle token hash verification (invitations, email confirmations)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // If both methods fail, redirect to login with an error
  return NextResponse.redirect(`${origin}/login`)
}
