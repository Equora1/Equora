'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'

function authRedirect(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params)
  redirect(`${path}?${query.toString()}`)
}

function mapAuthError(message: string) {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'E-Mail oder Passwort passen nicht zusammen.'
  if (lower.includes('email not confirmed')) return 'Bitte bestätige zuerst deine E-Mail-Adresse.'
  return 'Authentifizierung fehlgeschlagen. Prüfe deine Daten und versuche es erneut.'
}

export async function loginWithPassword(formData: FormData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const next = String(formData.get('next') || '/dashboard')

  if (!hasSupabaseClientEnv()) authRedirect('/login', { error: 'Supabase ist noch nicht konfiguriert. Demo-Modus bleibt aktiv.' })
  if (!email || !password) authRedirect('/login', { error: 'Bitte E-Mail und Passwort ausfüllen.', next })

  const supabase = await createSupabaseAuthServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) authRedirect('/login', { error: mapAuthError(error.message), next })

  revalidatePath('/', 'layout')
  redirect(next || '/dashboard')
}

export async function signupWithPassword(formData: FormData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')

  if (!hasSupabaseClientEnv()) authRedirect('/login', { error: 'Supabase ist noch nicht konfiguriert. Demo-Modus bleibt aktiv.' })
  if (!email || !password) authRedirect('/login', { error: 'Bitte E-Mail und Passwort ausfüllen.' })

  const supabase = await createSupabaseAuthServerClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) authRedirect('/login', { error: mapAuthError(error.message) })
  if (!data.session) authRedirect('/login', { success: 'Konto erstellt. Bitte bestätige jetzt deine E-Mail.' })

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
