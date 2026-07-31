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

  return setupTradeLinkRows.reduce<Record<string, LinkedSetupReference>>((accumulator, row) => {
    const setup = setupOptionMap.get(row.setup_id)
    if (setup) accumulator[row.trade_id] = setup
    return accumulator
  }, {})
}

export function resolveTradeSetupTitle(
  trade: Pick<TradeRow, 'id' | 'setup'> | { id: string; setup: string },
  linkedSetupByTradeId: Record<string, LinkedSetupReference>,
) {
  return linkedSetupByTradeId[trade.id]?.title ?? trade.setup
}
