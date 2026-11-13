import { loginWithPassword, signupWithPassword } from '@/app/actions/auth'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'

export function AuthPanel({ nextPath, error, success, locale }: {
  nextPath: string
  error?: string
  success?: string
  locale: JournalLocale
}) {
  const text = journalText(locale)
  const email = text('E-Mail-Adresse', 'Email address')
  const password = text('Passwort', 'Password')
  const fieldClassName = 'w-full rounded-xl border px-4 py-3 text-sm text-white outline-none placeholder:text-[#998a72]'

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {error ? <div role="alert" className="rounded-xl border border-[#e5484d]/25 bg-[#e5484d]/10 px-4 py-3 text-sm text-red-100 lg:col-span-2">{error}</div> : null}
      {success ? <div role="status" className="rounded-xl border border-[#c8823a]/25 bg-[#c8823a]/10 px-4 py-3 text-sm text-[#f0a855] lg:col-span-2">{success}</div> : null}

      <form action={loginWithPassword} className="eq-card rounded-[1.1rem] p-6">
        <input type="hidden" name="next" value={nextPath} />
        <h2 className="eq-display eq-text-gradient text-[1.85rem] leading-none">{text('Einloggen', 'Sign in')}</h2>

        <div className="mt-6 space-y-4">
          <input type="email" name="email" autoComplete="username" aria-label={email} placeholder={email} required className={fieldClassName} />
          <input type="password" name="password" autoComplete="current-password" aria-label={password} placeholder={password} required className={fieldClassName} />
        </div>
        <button type="submit" className="eq-button-primary mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold hover:opacity-95">{text('Einloggen', 'Sign in')}</button>
      </form>

      <form action={signupWithPassword} className="eq-card rounded-[1.1rem] p-6">
        <h2 className="eq-display eq-text-gradient text-[1.85rem] leading-none">{text('Registrieren', 'Register')}</h2>

        <div className="mt-6 space-y-4">
          <input type="email" name="email" autoComplete="username" aria-label={email} placeholder={email} required className={fieldClassName} />
          <input type="password" name="password" autoComplete="new-password" aria-label={password} placeholder={password} required className={fieldClassName} />
        </div>
        <button type="submit" className="eq-button-secondary mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold hover:opacity-95">{text('Konto erstellen', 'Create account')}</button>
      </form>
    </div>
  )
}
