import { cookies } from 'next/headers'
import type { JournalLocale } from '@/lib/i18n/journal'

const localeCookie = 'equora-journal-language'

export async function getJournalLocale(): Promise<JournalLocale> {
  const cookieStore = await cookies()
  return cookieStore.get(localeCookie)?.value === 'en' ? 'en' : 'de'
}

export async function setJournalLocale(locale: FormDataEntryValue | null) {
  if (locale !== 'de' && locale !== 'en') return

  const cookieStore = await cookies()
  cookieStore.set(localeCookie, locale, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  })
}
