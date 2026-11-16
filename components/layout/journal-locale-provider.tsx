'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { JournalLocale } from '@/lib/i18n/journal'

const JournalLocaleContext = createContext<JournalLocale>('de')

export function JournalLocaleProvider({ locale, children }: { locale: JournalLocale; children: ReactNode }) {
  return <JournalLocaleContext.Provider value={locale}>{children}</JournalLocaleContext.Provider>
}

export function useJournalLocale() {
  return useContext(JournalLocaleContext)
}
