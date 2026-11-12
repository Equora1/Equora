import { describe, expect, it } from 'vitest'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { buildSummary } from '@/lib/utils/review-summary-builders'

const metrics = getCoreMetrics([])
function winrate(current: Partial<typeof metrics>, previous: Partial<typeof metrics>) {
  return buildSummary({ ...metrics, ...current }, { ...metrics, ...previous }).find(item => item.label === 'Winrate')!
}
describe('review winrate explanation', () => {
  it('spells out percentage points and names the comparison and its baseline', () => {
    const item = winrate({ winRate: 20 / 164 * 100, resolvedTrades: 164, winners: 20, totalTrades: 164 }, { winRate: 22.8, resolvedTrades: 250 })
    expect(item.value).toBe('12,2 %')
    expect(item.hint).toBe('10,6 Prozentpunkte weniger · vorher 22,8 %')
    expect(item.basis).toBe('20 Gewinne · 164 Trades mit Ergebnis')
    expect(item.hint).not.toContain('pp')
  })
  it('distinguishes total period trades from the actual denominator', () => {
    const item = winrate({ winRate: 50, winners: 1, resolvedTrades: 2, totalTrades: 5 }, { winRate: 25, resolvedTrades: 4 })
    expect(item.hint).toContain('25 Prozentpunkte mehr')
    expect(item.basis).toContain('1 Gewinn · 2 Trades mit Ergebnis · 5 insgesamt')
  })
  it('does not fabricate a previous zero when the comparison period has no results', () => {
    const item = winrate({ winRate: 50, winners: 1, resolvedTrades: 2, totalTrades: 2 }, {})
    expect(item.hint).toContain('Kein Vergleich')
    expect(item.hint).not.toContain('Prozentpunkte')
  })
  it('shows missing current results separately from a real zero winrate', () => {
    expect(winrate({}, { resolvedTrades: 1, winRate: 100 }).value).toBe('—')
    expect(winrate({ resolvedTrades: 1, losers: 1, totalTrades: 1 }, { resolvedTrades: 1, winRate: 100 }).value).toBe('0 %')
  })
  it('does not describe a rounded zero as a decrease', () => {
    expect(winrate({ resolvedTrades: 3, winRate: 33.33 }, { resolvedTrades: 3, winRate: 33.34 }).hint).toContain('Unverändert')
  })
})
