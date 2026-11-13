import '@fontsource-variable/plus-jakarta-sans'
import './globals.css'
import type { Metadata } from 'next'
import { JournalLocaleProvider } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'
import { getJournalLocale } from '@/lib/server/journal-locale'

export async function generateMetadata(): Promise<Metadata> {
  const text = journalText(await getJournalLocale())
  return {
    title: 'Equora',
    description: text(
      'Equora für Setups, Trades, Auswertung und Feedback.',
      'Equora for setups, trades, analysis and feedback.',
    ),
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getJournalLocale()

  return (
    <html lang={locale}>
      <body>
        <JournalLocaleProvider locale={locale}>{children}</JournalLocaleProvider>
      </body>
    </html>
  )
}
