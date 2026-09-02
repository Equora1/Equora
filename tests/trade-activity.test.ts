import { describe, expect, it } from 'vitest'

import type { Trade, TradeDetail } from '../lib/types/trade'
import { buildTradeActivityTimeline } from '../lib/utils/trade-activity'

function createTrade(patch: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    date: '29.08.2026',
    market: 'BTCUSDT',
    setup: 'Liquidity Sweep',
    result: '—',
    r: '—',
    emotion: '',
    quality: 'B-Setup',
    session: '',
    concept: '',
    captureStatus: 'incomplete',
    ...patch,
  }
}

describe('trade activity timeline', () => {
  it('does not invent fills, costs, screenshots, or reviews for an incomplete journal row', () => {
    const items = buildTradeActivityTimeline(createTrade())

    expect(items.map((item) => item.id)).toEqual(['journal-capture'])
    expect(items[0]).toMatchObject({ evidence: 'manual', tone: 'caution' })
    expect(items[0].description).toContain('unvollständig')
  })

  it('orders only the journal evidence that is actually available', () => {
    const trade = createTrade({
      captureStatus: 'complete',
      captureResult: 'winner',
      tradeOccurredAt: '2026-08-29T09:30:00.000Z',
      completedAt: '2026-08-29T10:10:00.000Z',
      direction: 'long',
      netPnL: 120,
      pnlSource: 'derived',
      fees: 4,
      partialExits: [{ percent: 50, price: 120_000 }],
      partialExitHasOpenRemainder: true,
      screenshotCount: 2,
    })
    const detail = {
      executionLabel: 'Brutto 124 USDT → Netto 120 USDT',
      costLabel: 'Kommission 4 USDT · Total 4 USDT',
      partialExitsLabel: '50% bei 120000',
      partialExitRemainingLabel: '50% Restposition',
      reviewState: 'Review abgeschlossen',
    } as TradeDetail

    const items = buildTradeActivityTimeline(trade, detail, 3)

    expect(items.map((item) => item.id)).toEqual([
      'journal-capture',
      'trade-time',
      'partial-exits',
      'execution-result',
      'costs',
      'evidence',
      'review',
    ])
    expect(items.find((item) => item.id === 'execution-result')?.evidence).toBe('derived')
    expect(items.find((item) => item.id === 'evidence')?.description).toBe('2 Screenshots · 3 Tags.')
  })

  it('labels imported capture provenance without claiming provider execution evidence', () => {
    const items = buildTradeActivityTimeline(createTrade({
      hasImportMeta: true,
      importPresetLabel: 'Generic CSV',
    }))

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'journal-capture', evidence: 'recorded' })
    expect(items[0].description).toContain('Generic CSV')
    expect(items[0].description).not.toContain('Broker-Fill bestätigt')
  })
})
