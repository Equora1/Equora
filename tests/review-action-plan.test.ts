import { describe, expect, it } from 'vitest'
import type { Trade } from '@/lib/types/trade'
import { buildReviewSnapshot } from '@/lib/utils/review'
import { buildReviewActionPlan } from '@/lib/utils/review-to-action'

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: crypto.randomUUID(), date: '2026-10-15T12:00:00.000Z', market: 'TEST', setup: 'Testsetup',
    result: '', r: '', emotion: '', quality: 'B-Setup', session: 'London', concept: '',
    captureStatus: 'complete', ...overrides,
  }
}

describe('Review next actions respect unavailable monetary analysis', () => {
  it.each([
    { name: 'missing currency', rows: [trade({ netPnL: 10 })], kind: 'unknown', focus: 'Währungsangaben prüfen' },
    { name: 'mixed currencies', rows: [trade({ netPnL: 10, accountCurrency: 'EUR' }), trade({ netPnL: 10, accountCurrency: 'USD' })], kind: 'mixed', focus: 'Trades nach Währung trennen' },
    { name: 'missing outcomes', rows: [trade({ accountCurrency: 'EUR' })], kind: 'empty', focus: 'Ergebnisse ergänzen' },
  ])('offers a data action for $name without treating a lock label as a setup', ({ rows, kind, focus }) => {
    const snapshot = buildReviewSnapshot(rows, [], [], 'mock')
    const before = structuredClone(snapshot)
    expect(snapshot.sessionDraft.monetaryScopeKind).toBe(kind)
    const plan = buildReviewActionPlan(snapshot)
    expect(plan.dailyFocusSuggestion).toBe(focus)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].href).toBe('/trades')
    expect(plan.dailyFocusSuggestion).not.toContain('Gesperrt')
    expect(plan.steps[0].title).not.toContain('Gesperrt')
    expect(snapshot).toEqual(before)
  })

  it('asks for trades when the period is empty', () => {
    const plan = buildReviewActionPlan(buildReviewSnapshot([], [], [], 'mock'))
    expect(plan.dailyFocusSuggestion).toBe('Trades für diesen Zeitraum erfassen')
    expect(plan.checklist).toHaveLength(1)
  })

  it('keeps the existing action path for a comparable currency', () => {
    const snapshot = buildReviewSnapshot([trade({ netPnL: 10, accountCurrency: 'EUR' })], [], [], 'mock')
    const before = structuredClone(snapshot)
    expect(snapshot.sessionDraft.monetaryScopeKind).toBe('single')
    expect(buildReviewActionPlan(snapshot).headline).toBe('Plan für morgen')
    expect(snapshot).toEqual(before)
  })

  it('does not classify a documented monetary zero as missing results', () => {
    const snapshot = buildReviewSnapshot([trade({ netPnL: 0, accountCurrency: 'EUR' })], [], [], 'mock')
    expect(snapshot.sessionDraft.monetaryScopeKind).toBe('single')
    expect(buildReviewActionPlan(snapshot).dailyFocusSuggestion).not.toBe('Ergebnisse ergänzen')
    expect(snapshot.sessionDraft.netPnL).toBe(0)
  })
})
