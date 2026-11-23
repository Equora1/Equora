import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loginWithPassword, signupWithPassword } from '@/app/actions/auth'
import { getAuthErrorText, getAuthSuccessText } from '@/lib/i18n/auth'
import { tradingCheckInLoginCookie } from '@/lib/utils/trading-check-in'

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(path) }),
  revalidatePath: vi.fn(),
  isConfigured: vi.fn(),
  setCookie: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: auth.revalidatePath }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: auth.setCookie }) }))
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
    expect(auth.setCookie).not.toHaveBeenCalled()
  })

  it('localizes the email confirmation after registration', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
    await expect(signupWithPassword(authForm())).rejects.toThrow('/login?success=confirm-email')
    expect(getAuthSuccessText('confirm-email', 'de')).toContain('Bestätige jetzt deine E-Mail-Adresse')
    expect(getAuthSuccessText('confirm-email', 'en')).toContain('Confirm your email address')
    expect(auth.setCookie).not.toHaveBeenCalled()
  })

  it('retains the normal journal destination after sign-in', async () => {
    await expect(loginWithPassword(authForm('/trades?tab=history'))).rejects.toThrow('/trades?tab=history')
    expect(auth.revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(auth.setCookie).toHaveBeenCalledExactlyOnceWith(tradingCheckInLoginCookie, '1', expect.objectContaining({
      path: '/',
      sameSite: 'lax',
      maxAge: 120,
    }))
  })

  it('requests the check-in when registration immediately establishes a session', async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null })
    await expect(signupWithPassword(authForm())).rejects.toThrow('/dashboard')
    expect(auth.setCookie).toHaveBeenCalledOnce()
  })

  it('does not request a check-in for demo sign-in', async () => {
    auth.isConfigured.mockReturnValue(false)
    await expect(loginWithPassword(authForm())).rejects.toThrow('/login?error=demo')
    expect(auth.setCookie).not.toHaveBeenCalled()
  })

  it('defaults to the dashboard if the login destination is not a local path', async () => {
    await expect(loginWithPassword(authForm('https://example.test'))).rejects.toThrow('/dashboard')
  })
})
