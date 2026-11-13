import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CostProfilesHub } from '@/components/cost-profiles/cost-profiles-hub'
import type { SavedUserCostProfile } from '@/lib/types/user-cost-profile'
import { DashboardOverview } from '@/components/dashboard/dashboard-overview'
import { JournalLocaleProvider } from '@/components/layout/journal-locale-provider'
import { EquoraShareHub } from '@/components/share/equora-share-hub'
import { TradeCurrencyQualityPanel } from '@/components/trades/trade-currency-quality-panel'
import { formatJournalTradeDate, formatJournalTradeResult, formatJournalTradeR } from '@/lib/i18n/trade-display'
import type { Trade } from '@/lib/types/trade'
import type { SharedTradeSubmissionRow } from '@/lib/types/db'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import type { TradeRow } from '@/lib/types/db'

vi.mock('@/app/actions/user-cost-profiles', () => ({
  saveUserCostProfile: vi.fn(), updateUserCostProfile: vi.fn(), deleteUserCostProfile: vi.fn(),
}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/navigation')>(),
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/app/actions/shared-trades', () => ({
  createTradeShareSubmission: vi.fn(), revokeTradeShareSubmission: vi.fn(), updateSharedTradeSubmissionByAdmin: vi.fn(),
}))

const trade: Trade = {
  id: 'synthetic-trade',
  date: '01 Mär 2026',
  tradeOccurredAt: '2026-02-28T23:30:00Z',
  market: 'BTCUSDT.P',
  setup: 'Eigener Setupname',
  result: '+0,004 USDT',
  r: '+1,25R (geplant)',
  emotion: '',
  quality: 'A-Setup',
  session: 'London',
  concept: '',
  netPnL: 0.004,
  accountCurrency: 'USDT',
  captureStatus: 'complete',
  captureResult: 'winner',
  rValue: 1.25,
  rSource: 'planned',
}

describe('bilingual journal display', () => {
  it.each([
    ['de', 'Ausgewählte Beiträge konnten nicht geladen werden.', 'Erneut laden', 'Keine Einträge.'],
    ['en', 'Could not load featured trades.', 'Try again', 'No featured trades yet.'],
  ] as const)('distinguishes featured trade errors from an empty list in %s', (locale, error, retry, empty) => {
    const render = (featuredSubmissions: [] | null) => renderToStaticMarkup(
      <JournalLocaleProvider locale={locale}>
        <EquoraShareHub trades={[]} ownSubmissions={[]} featuredSubmissions={featuredSubmissions} source="supabase" />
      </JournalLocaleProvider>,
    )

    const unavailable = render(null)
    expect(unavailable).toContain(error)
    expect(unavailable).toContain(retry)
    expect(unavailable).not.toContain(empty)
    expect(render([])).toContain(empty)
  })

  it('keeps the Berlin trade date, currency and precision while localizing the display', () => {
    expect(formatJournalTradeDate(trade, 'de')).toBe('01 Mär 2026')
    expect(formatJournalTradeDate(trade, 'en')).toBe('01 Mar 2026')
    expect(formatJournalTradeResult(trade, 'en')).toBe('+0.004 USDT')
    expect(formatJournalTradeR(trade, 'en')).toBe('+1.25R (planned)')
    expect(formatJournalTradeResult({ ...trade, accountCurrency: null }, 'en')).toBe('Currency missing')
    expect(formatJournalTradeR({ ...trade, rSource: 'missing', rValue: 0 }, 'en')).toBe('R unavailable')
  })

  it('shows the same trade and the same P&L eligibility in both dashboard languages', () => {
    const props = { trades: [trade], dailyNotes: [], source: 'supabase', availability: 'ready' } satisfies React.ComponentProps<typeof DashboardOverview>
    const german = renderToStaticMarkup(<DashboardOverview {...props} />)
    const english = renderToStaticMarkup(<DashboardOverview {...props} locale="en" />)

    expect(german).toContain('Kumuliertes Netto-P&amp;L')
    expect(english).toContain('Cumulative net P&amp;L')
    expect(german).toContain('+0,004 USDT')
    expect(english).toContain('+0.004 USDT')
    expect(english).toContain('Eigener Setupname')
    expect(english).toContain('aria-valuenow="100"')

    const mixed = renderToStaticMarkup(<DashboardOverview {...props} locale="en" trades={[trade, { ...trade, id: 'usd-trade', accountCurrency: 'USD', netPnL: 50 }]} />)
    expect(mixed).toContain('Multiple currencies without an exchange rate')
    expect(mixed).not.toContain('+50.004')
  })

  it('keeps an unsupported currency distinct from a missing currency in both languages', () => {
    const row = {
      id: 'synthetic-jpy', market: 'TEST', setup: 'Test', created_at: '2026-02-28T23:30:00Z',
      net_pnl: '12.5', pnl_mode: 'manual', account_currency: 'JPY',
    } as TradeRow
    const unsupported = mapTradeRowToTrade(row)
    const missing = mapTradeRowToTrade({ ...row, account_currency: null })
    expect(unsupported).toMatchObject({ accountCurrency: null, accountCurrencyStatus: 'unsupported' })
    expect(formatJournalTradeResult(unsupported, 'de')).toBe('Währung nicht unterstützt')
    expect(formatJournalTradeResult(unsupported, 'en')).toBe('Unsupported currency')
    expect(formatJournalTradeResult(missing, 'en')).toBe('Currency missing')
  })

  it('localizes cost labels and amounts while keeping saved profile selections', () => {
    const profile: SavedUserCostProfile = {
      id: 'cost-fixture', title: 'Eigene Krypto-Gebühren',
      defaultAccountTemplate: null, defaultMarketTemplate: null, brokerProfile: 'manual',
      instrumentType: 'crypto', costProfile: 'user-custom', accountCurrency: 'USDT',
      cryptoMarketType: 'perps', executionType: 'maker', fundingDirection: 'manual',
      quoteAsset: 'USDT', leverage: 3, pointValue: null, fees: 0.75, exchangeFees: 0.15,
      fundingFees: 0.1, fundingRateBps: 1.5, fundingIntervals: 2, spreadCost: 0.2, slippage: 0.05,
      source: 'mock', createdAt: '2026-10-17T22:52:00Z',
    }
    const render = (locale: 'de' | 'en') => renderToStaticMarkup(
      <JournalLocaleProvider locale={locale}>
        <CostProfilesHub initialProfiles={[profile]} usageByProfileId={{ [profile.id]: 1 }} source="mock" />
      </JournalLocaleProvider>,
    )
    const de = render('de')
    const en = render('en')
    expect(de).toContain('1,25 · Kontowährung je Trade')
    expect(en).toContain('1.25 · account currency per trade')
    expect(en).toContain('Funding rate (basis points)')
    expect(en).toContain('Update profile')
    for (const html of [de, en]) {
      expect(html).toContain('value="Eigene Krypto-Gebühren"')
      expect(html).toMatch(/<option(?=[^>]*value="USDT")(?=[^>]*selected="")[^>]*>USDT<\/option>/)
      expect(html).toMatch(/<option(?=[^>]*value="maker")(?=[^>]*selected="")[^>]*>/)
      expect(html).toContain('value="0.75"')
      expect(html).toContain('00:52')
    }
  })

  it('localizes the active currency filter label without changing the selected filter', () => {
    const html = renderToStaticMarkup(
      <JournalLocaleProvider locale="en">
        <TradeCurrencyQualityPanel
          summary={{ total: 3, known: 1, missing: 1, unsupported: 1, needsReview: 2 }}
          selected="Fehlt"
          onChange={() => {}}
        />
      </JournalLocaleProvider>,
    )
    expect(html).toMatch(/<button[^>]+aria-pressed="true"[^>]*>Currency missing \(1\)<\/button>/)
    expect(html).toContain('Unsupported currency (1)')
    expect(html).toContain('Clear currency filter')
  })

  it('shows what will be shared and preserves the selected trade in both languages', () => {
    const render = (locale: 'de' | 'en') => renderToStaticMarkup(
      <JournalLocaleProvider locale={locale}>
        <EquoraShareHub trades={[trade]} ownSubmissions={[]} selectedTradeId={trade.id} source="mock" />
      </JournalLocaleProvider>,
    )
    const de = render('de')
    const en = render('en')
    expect(de).toContain('Trade teilen')
    expect(de).toContain('vorhandene Trade-Notizen und Tags')
    expect(de).toContain('+0,004 USDT')
    expect(en).toContain('Share a trade')
    expect(en).toContain('existing trade notes and tags')
    expect(en).toContain('Your display name stays hidden.')
    expect(en).toContain('01 Mar 2026')
    expect(en).toContain('+0.004 USDT')
    expect(en).toContain('Eigener Setupname')
    expect(en.indexOf('What will be shared')).toBeLessThan(en.indexOf('Submit trade'))
  })

  it('localizes shared snapshots without translating their names, notes or tags', () => {
    const submission: SharedTradeSubmissionRow = {
      id: 'shared-fixture', trade_id: trade.id, share_mode: 'review', visibility: 'anonymous', status: 'reviewed',
      user_note: 'Eigene Notiz', admin_note: null, coach_feedback: 'Eigenes Feedback',
      learning_category: 'Risk Management', review_labels: [], coach_strengths: [], coach_mistakes: [],
      coach_action: null, vault_blurb: null, featured_at: null, vault_opt_in: false, submitted_by_name: null,
      shared_market: trade.market, shared_setup: trade.setup, shared_result: 'Gewinner', shared_r_multiple: 1.25,
      shared_net_pnl: '0.004', shared_currency: 'USDT', shared_capture_status: 'complete', shared_capture_result: 'winner',
      shared_notes: null, shared_quality: 'A-Setup', shared_tags: ['Eigener Tag'], shared_screenshot_url: null,
      reviewed_at: null, reviewed_by: null,
    }
    const render = (locale: 'de' | 'en') => renderToStaticMarkup(
      <JournalLocaleProvider locale={locale}>
        <EquoraShareHub trades={[trade]} ownSubmissions={[submission]} source="mock" />
      </JournalLocaleProvider>,
    )
    const de = render('de')
    const en = render('en')
    expect(de).toContain('Risikomanagement')
    expect(de).toContain('Gewinner')
    expect(en).toContain('Risk Management')
    expect(en).toContain('>Win<')
    expect(en).toContain('Withdraw')
    expect(en).toContain('+0.004 USDT')
    for (const value of ['Eigener Setupname', 'Eigene Notiz', 'Eigenes Feedback', 'Eigener Tag']) {
      expect(de).toContain(value)
      expect(en).toContain(value)
    }
  })
})
