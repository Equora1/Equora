export type JournalLocale = 'de' | 'en'

export const journalLanguages = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
] as const satisfies ReadonlyArray<{ code: JournalLocale; name: string }>

export function journalText(locale: JournalLocale) {
  return (de: string, en: string) => locale === 'en' ? en : de
}

export const journalNumberLocale = { de: 'de-DE', en: 'en-GB' } as const
