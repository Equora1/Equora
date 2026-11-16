import { journalText, type JournalLocale } from '@/lib/i18n/journal'

export function getLoginNextPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return '/dashboard'
  }

  return value
}

export function getAuthErrorText(code: string | undefined, locale: JournalLocale): string | undefined {
  const text = journalText(locale)
  switch (code) {
    case undefined:
    case '':
      return undefined
    case 'demo':
      return text('In der Demo ist keine Anmeldung möglich.', 'Sign-in is unavailable in demo mode.')
    case 'missing-credentials':
      return text('Gib deine E-Mail-Adresse und dein Passwort ein.', 'Enter your email address and password.')
    case 'invalid-credentials':
      return text('E-Mail-Adresse oder Passwort stimmen nicht.', 'The email address or password is incorrect.')
    case 'email-unconfirmed':
      return text('Bestätige zuerst deine E-Mail-Adresse.', 'Confirm your email address first.')
    default:
      return text('Die Anmeldung ist fehlgeschlagen. Versuche es erneut.', 'Authentication failed. Try again.')
  }
}

export function getAuthSuccessText(code: string | undefined, locale: JournalLocale): string | undefined {
  return code === 'confirm-email'
    ? journalText(locale)('Dein Konto wurde erstellt. Bestätige jetzt deine E-Mail-Adresse.', 'Your account is ready. Confirm your email address to sign in.')
    : undefined
}
