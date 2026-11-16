import Link from 'next/link'
import { journalText } from '@/lib/i18n/journal'
import { getJournalLocale } from '@/lib/server/journal-locale'

export default async function NotFound() {
  const text = journalText(await getJournalLocale())

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h1 className="text-2xl font-semibold">{text('Seite nicht gefunden', 'Page not found')}</h1>
        <Link href="/dashboard" className="eq-button-primary mt-5 inline-flex rounded-2xl px-4 py-3 text-sm font-medium">
          {text('Zur Startseite', 'Go to dashboard')}
        </Link>
      </div>
    </main>
  )
}
