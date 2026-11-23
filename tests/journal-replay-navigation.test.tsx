import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JournalLayout from '@/app/(journal)/layout'
import type { JournalLocale } from '@/lib/i18n/journal'

const navigation = vi.hoisted(() => ({
  pathname: '/review-sessions',
  locale: 'de' as JournalLocale,
  serverConfigured: true,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/navigation')>(),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/server/journal-locale', () => ({
  getJournalLocale: async () => navigation.locale,
  setJournalLocale: vi.fn(),
}))
vi.mock('@/lib/supabase/config', () => ({
  hasSupabaseClientEnv: () => true,
  hasSupabaseServerEnv: () => navigation.serverConfigured,
}))

async function renderJournalNavigation() {
  return renderToStaticMarkup(await JournalLayout({ children: null }))
}

describe('Replay navigation in the journal layout', () => {
  beforeEach(() => {
    navigation.pathname = '/review-sessions'
    navigation.locale = 'de'
    navigation.serverConfigured = true
  })

  afterEach(() => vi.unstubAllEnvs())

  it('keeps the usual advanced links and hides Replay when storage is off', async () => {
    vi.stubEnv('EQUORA_TRADINGVIEW_REPLAY_STORAGE', undefined)
    const markup = await renderJournalNavigation()

    expect(markup).toContain('href="/review-sessions"')
    expect(markup).not.toContain('href="/replay"')
  })

  it('hides Replay if storage is enabled without the required server configuration', async () => {
    vi.stubEnv('EQUORA_TRADINGVIEW_REPLAY_STORAGE', 'enabled')
    navigation.serverConfigured = false

    expect(await renderJournalNavigation()).not.toContain('href="/replay"')
  })

  it.each([
    ['de', 'Erweitert', 'Replay-Backtesting', 'Strategien im Replay testen und auswerten'],
    ['en', 'More', 'Replay backtesting', 'Test and review strategies in Replay'],
  ] as const)('links to Replay and marks it as the current advanced page in %s', async (locale, group, label, hint) => {
    vi.stubEnv('EQUORA_TRADINGVIEW_REPLAY_STORAGE', 'enabled')
    navigation.locale = locale
    navigation.pathname = '/replay'
    const markup = await renderJournalNavigation()

    expect(markup).toContain(`>${group}<`)
    expect(markup).toContain(`>${label}<`)
    expect(markup).toContain(`>${hint}<`)
    expect(markup.match(/<a\b[^>]*href="\/replay"[^>]*>/)?.[0]).toContain('aria-current="page"')
  })
})
