import type { SetupRow, SetupTradeLinkRow, TradeRow } from '@/lib/types/db'

export type LinkedSetupReference = {
  id: string
  title: string
}

export function buildLinkedSetupByTradeId(
  setupRows: SetupRow[],
  setupTradeLinkRows: SetupTradeLinkRow[],
): Record<string, LinkedSetupReference> {
  const setupOptionMap = new Map(
    setupRows
      .filter((setup) => Boolean(setup.id) && Boolean(setup.title?.trim()))
      .map((setup) => [setup.id, { id: setup.id, title: setup.title.trim() }]),
  )

  const selectedLinks = new Map<string, { time: number; subMillisecond: string; id: string }>()
  return setupTradeLinkRows.reduce<Record<string, LinkedSetupReference>>((accumulator, row) => {
    const setup = setupOptionMap.get(row.setup_id)
    if (!setup) return accumulator
    const parsedTime = Date.parse(row.created_at)
    const time = Number.isFinite(parsedTime) ? parsedTime : Number.NEGATIVE_INFINITY
    // Date.parse normalizes the timezone but truncates PostgreSQL microseconds.
    // Retain the remaining decimal digits; trimming trailing zeros makes equal
    // instants compare equally without floating-point rounding.
    const subMillisecond = Number.isFinite(parsedTime)
      ? (row.created_at.match(/[T ]\d{2}:\d{2}:\d{2}\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)?$/i)?.[1]?.slice(3) ?? '').replace(/0+$/, '')
      : ''
    const selected = selectedLinks.get(row.trade_id)
    // Latest valid association wins, independent of pagination/transport order.
    // Missing dates rank behind dated links; equal dates use a stable ID tie-break.
    if (!selected || time > selected.time || (time === selected.time && (
      subMillisecond > selected.subMillisecond || (subMillisecond === selected.subMillisecond && row.id > selected.id)
    ))) {
      selectedLinks.set(row.trade_id, { time, subMillisecond, id: row.id })
      accumulator[row.trade_id] = setup
    }
    return accumulator
  }, {})
}

export function resolveTradeSetupTitle(
  trade: Pick<TradeRow, 'id' | 'setup'> | { id: string; setup: string },
  linkedSetupByTradeId: Record<string, LinkedSetupReference>,
) {
  return linkedSetupByTradeId[trade.id]?.title ?? trade.setup
}
