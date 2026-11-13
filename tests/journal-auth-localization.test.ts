import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loginWithPassword, signupWithPassword } from '@/app/actions/auth'
import { getAuthErrorText, getAuthSuccessText } from '@/lib/i18n/auth'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(path) }),
  revalidatePath: vi.fn(),
  isConfigured: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: auth.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: auth.redirect }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: auth.isConfigured }))
vi.mock('@/lib/supabase/server-auth', () => ({
  createSupabaseAuthServerClient: async () => ({ auth }),
}))

function authForm(next?: string) {
  const form = new FormData()
  form.set('email', 'demo@example.test')
  form.set('password', 'fixture-password')
  if (next) form.set('next', next)
  return form
}

describe('login and registration language', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.isConfigured.mockReturnValue(true)
    auth.signInWithPassword.mockResolvedValue({ error: null })
  })

  it('preserves the journal destination and displays the same login error in either language', async () => {
    const next = '/trades?tab=history'
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    await expect(loginWithPassword(authForm(next))).rejects.toThrow('/login?error=invalid-credentials&next=%2Ftrades%3Ftab%3Dhistory')
    expect(getAuthErrorText('invalid-credentials', 'de')).toBe('E-Mail-Adresse oder Passwort stimmen nicht.')
    expect(getAuthErrorText('invalid-credentials', 'en')).toBe('The email address or password is incorrect.')
    expect(auth.revalidatePath).not.toHaveBeenCalled()
  })

  it('localizes the email confirmation after registration', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
    await expect(signupWithPassword(authForm())).rejects.toThrow('/login?success=confirm-email')
    expect(getAuthSuccessText('confirm-email', 'de')).toContain('Bestätige jetzt deine E-Mail-Adresse')
    expect(getAuthSuccessText('confirm-email', 'en')).toContain('Confirm your email address')
  })

  it('retains the normal journal destination after sign-in', async () => {
    await expect(loginWithPassword(authForm('/trades?tab=history'))).rejects.toThrow('/trades?tab=history')
    expect(auth.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('defaults to the dashboard if the login destination is not a local path', async () => {
    await expect(loginWithPassword(authForm('https://example.test'))).rejects.toThrow('/dashboard')
  })
})
