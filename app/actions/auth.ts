'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLoginNextPath } from '@/lib/i18n/auth'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { tradingCheckInLoginCookie } from '@/lib/utils/trading-check-in'

async function requestTradingCheckIn() {
  const cookieStore = await cookies()
  // The browser consumes this flag. It contains no session or account information.
  cookieStore.set(tradingCheckInLoginCookie, '1', {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 120,
  })
}

function authRedirect(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params)
  redirect(`${path}?${query.toString()}`)
}

function getAuthErrorCode(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'invalid-credentials'
  if (lower.includes('email not confirmed')) return 'email-unconfirmed'
  return 'auth-failed'
}

export async function loginWithPassword(formData: FormData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const next = getLoginNextPath(formData.get('next'))

  if (!hasSupabaseClientEnv()) authRedirect('/login', { error: 'demo', next })
  if (!email || !password) authRedirect('/login', { error: 'missing-credentials', next })

  const supabase = await createSupabaseAuthServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) authRedirect('/login', { error: getAuthErrorCode(error.message), next })

  await requestTradingCheckIn()
  revalidatePath('/', 'layout')
  redirect(next)
}

export async function signupWithPassword(formData: FormData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')

  if (!hasSupabaseClientEnv()) authRedirect('/login', { error: 'demo' })
  if (!email || !password) authRedirect('/login', { error: 'missing-credentials' })

  const supabase = await createSupabaseAuthServerClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) authRedirect('/login', { error: getAuthErrorCode(error.message) })
  if (!data.session) authRedirect('/login', { success: 'confirm-email' })

  await requestTradingCheckIn()
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
