import { describe, expect, it } from 'vitest'
import type { SetupRow, SetupTradeLinkRow } from '@/lib/types/db'
import { buildLinkedSetupByTradeId, resolveTradeSetupTitle } from '@/lib/utils/trade-setup-links'

const setups = [{ id: 'old-setup', title: 'Older setup' }, { id: 'new-setup', title: '  Latest setup  ' }] as SetupRow[]
const link = (id: string, setup_id: string, created_at: string, trade_id = 'trade'): SetupTradeLinkRow => ({ id, setup_id, created_at, trade_id, user_id: 'owner' })

describe('setup selection independent of transport ordering', () => {
  it('selects the most recently linked valid setup despite reversed UUID and time ordering', () => {
    const old = link('z-old', 'old-setup', '2026-10-14T10:00:00Z')
    const latest = link('a-new', 'new-setup', '2026-10-15T10:00:00Z')
    for (const rows of [[latest, old], [old, latest]]) {
      expect(buildLinkedSetupByTradeId(setups, rows).trade).toEqual({ id: 'new-setup', title: 'Latest setup' })
    }
  })
  it('uses a stable ID tie-break for equal instants in different time zones', () => {
    const a = link('a-link', 'old-setup', '2026-10-15T10:00:00Z')
    const z = link('z-link', 'new-setup', '2026-10-15T12:00:00+02:00')
    expect(buildLinkedSetupByTradeId(setups, [z, a]).trade.id).toBe('new-setup')
    expect(buildLinkedSetupByTradeId(setups, [a, z]).trade.id).toBe('new-setup')
  })
  it('retains PostgreSQL microseconds before considering the link ID', () => {
    const older = link('ffffffff-ffff-4fff-8fff-ffffffffffff', 'old-setup', '2026-10-15T12:00:00.000001Z')
    const newer = link('00000000-0000-4000-8000-000000000001', 'new-setup', '2026-10-15T12:00:00.000002Z')
    expect(buildLinkedSetupByTradeId(setups, [older, newer]).trade.id).toBe('new-setup')
    expect(buildLinkedSetupByTradeId(setups, [newer, older]).trade.id).toBe('new-setup')
  })
  it('compares equal submillisecond instants across offsets and fractional spellings', () => {
    const a = link('a-link', 'old-setup', '2026-10-15T12:00:00.123400Z')
    const z = link('z-link', 'new-setup', '2026-10-15T14:00:00.1234+02:00')
    expect(buildLinkedSetupByTradeId(setups, [z, a]).trade.id).toBe('new-setup')
  })
  it('does not allow an invalid timestamp to displace a dated valid link', () => {
    const dated = link('a-link', 'new-setup', '2026-10-15T10:00:00Z')
    const undated = link('z-link', 'old-setup', 'invalid')
    expect(buildLinkedSetupByTradeId(setups, [dated, undated]).trade.id).toBe('new-setup')
  })
  it('uses the same stable tie-break when both timestamps are unavailable', () => {
    const a = link('a-link', 'old-setup', '')
    const z = link('z-link', 'new-setup', '')
    expect(buildLinkedSetupByTradeId(setups, [z, a]).trade.id).toBe('new-setup')
    expect(buildLinkedSetupByTradeId(setups, [a, z]).trade.id).toBe('new-setup')
  })
  it('ignores inaccessible and blank-title targets while preserving the stored-title fallback', () => {
    const old = link('a', 'old-setup', '2026-10-14T00:00:00Z')
    const inaccessible = link('b', 'missing-setup', '2026-10-15T00:00:00Z')
    const blank = link('c', 'blank', '2026-10-16T00:00:00Z')
    const result = buildLinkedSetupByTradeId([...setups, { id: 'blank', title: ' ' } as SetupRow], [old, inaccessible, blank])
    expect(result.trade.id).toBe('old-setup')
    expect(resolveTradeSetupTitle({ id: 'unlinked', setup: 'Stored setup' }, result)).toBe('Stored setup')
  })
  it('selects independently per trade and does not mutate its inputs', () => {
    const rows = [link('z', 'new-setup', '2026-10-15T00:00:00Z'), link('a', 'old-setup', '2026-10-14T00:00:00Z', 'other')]
    const before = JSON.stringify({ setups, rows })
    expect(buildLinkedSetupByTradeId(setups, rows).other.id).toBe('old-setup')
    expect(JSON.stringify({ setups, rows })).toBe(before)
  })
})
