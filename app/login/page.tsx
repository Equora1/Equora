import { redirect } from 'next/navigation'
import { AuthPanel } from '@/components/auth/auth-panel'
import { getCurrentUser } from '@/lib/server/auth'
import { getJournalLocale, setJournalLocale } from '@/lib/server/journal-locale'
import { getAuthErrorText, getAuthSuccessText, getLoginNextPath } from '@/lib/i18n/auth'
import { journalLanguages, journalText } from '@/lib/i18n/journal'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { brokerFileImportCapability } from '@/lib/utils/broker-file-import-capability'

export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ error?: string; success?: string; next?: string; logged_out?: string }> }) {
  const [query, user, locale] = await Promise.all([searchParams, getCurrentUser(), getJournalLocale()])
  const params = query ?? {}
  const logoutBounce = params.logged_out === '1'

  if (user && !logoutBounce) redirect('/dashboard')

  const text = journalText(locale)
  const nextPath = getLoginNextPath(params.next)
  const loginQuery = new URLSearchParams()
  if (params.next) loginQuery.set('next', nextPath)
  if (logoutBounce) loginQuery.set('logged_out', '1')
  if (typeof params.error === 'string') loginQuery.set('error', params.error)
  if (typeof params.success === 'string') loginQuery.set('success', params.success)
  const returnPath = loginQuery.size ? `/login?${loginQuery}` : '/login'

  async function changeLoginLanguage(formData: FormData) {
    'use server'

    await setJournalLocale(formData.get('language'))
    redirect(returnPath)
  }

  const intro = hasSupabaseClientEnv()
    ? text('Melde dich an, um dein Journal zu öffnen.', 'Sign in to open your journal.')
    : text('Du nutzt die Demo.', 'You are using the demo.')

  return (
    <main lang={locale} className="flex min-h-screen items-center justify-center bg-[#080808] px-6 py-10 text-white">
      <div className="w-full max-w-5xl space-y-6">
        <div className="rounded-[28px] border border-[#221e1a] bg-[#0d0d0d]/95 p-8 shadow-[0_24px_72px_rgba(0,0,0,0.48)] xl:p-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eq-display text-[0.68rem] text-[#b09a7a]">Equora</p>
            <form action={changeLoginLanguage} aria-label={text('Sprache wählen', 'Choose language')} className="flex gap-1">
              {journalLanguages.map(({ code, name }) => (
                <button
                  key={code}
                  type="submit"
                  name="language"
                  value={code}
                  lang={code}
                  aria-pressed={code === locale}
                  className={`rounded-full border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60 ${code === locale ? 'border-[#f0a855]/55 text-[#f0a855]' : 'border-white/15 text-white/75'}`}
                >
                  {name}
                </button>
              ))}
            </form>
          </div>
          <h1 className="eq-display eq-text-gradient mt-4 text-[2.65rem] leading-none">{text('Dein Trading-Journal', 'Your trading journal')}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#998a72]">{intro}</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <AuthPanel
            nextPath={nextPath}
            error={getAuthErrorText(params.error, locale)}
            success={getAuthSuccessText(params.success, locale)}
            locale={locale}
          />

          <div className="rounded-[28px] border border-[#221e1a] bg-[#0d0d0d]/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-7">
            <h2 className="text-2xl font-semibold text-white">{text('Trades im Blick', 'Track your trades')}</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                text(brokerFileImportCapability.previewActionLabel, 'Preview an import file'),
                text('Review starten', 'Start a review'),
                'Setups',
                text('Statistik', 'Statistics'),
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-[#221e1a] bg-[#1f1c1a]/45 px-4 py-3.5">
                  <p className="text-sm text-white/82">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
