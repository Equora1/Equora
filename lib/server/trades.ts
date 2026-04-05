import { getJournalSnapshotServer } from '@/lib/server/journal'
import type { TradeRow } from '@/lib/types/db'

export async function getTradesServer(userId?: string | null): Promise<TradeRow[]> {
  const snapshot = await getJournalSnapshotServer(userId)
  return snapshot.tradeRows
}

export async function getTradesServerForUser(userId: string) {
  return getTradesServer(userId)
}

export async function getTradeByIdServer(tradeId: string, userId?: string | null) {
  const rows = await getTradesServer(userId)
  const row = rows.find((item) => item.id === tradeId)

  if (!row) {
    throw new Error('Trade konnte nicht geladen werden.')
  }

  return row
}
