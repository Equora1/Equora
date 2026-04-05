import { AppShell } from '@/components/layout/app-shell'
import { DailyNoteFlowCard } from '@/components/daily-notes/daily-note-flow-card'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { getBerlinTodayDateKey } from '@/lib/utils/daily-notes'
import { getTrustedTrades } from '@/lib/utils/trade-trust'



export const dynamic = 'force-dynamic'

export default async function DailyNotePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const initialDateKey = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : getBerlinTodayDateKey()
  const initialFocusValue = typeof params.focus === 'string' ? params.focus : undefined
  const access = await getJournalAccess()
  const snapshot = await getJournalSnapshotServer(access.user?.id)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))
  const trustedTrades = getTrustedTrades(trades)

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trustedTrades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <DailyNoteFlowCard
        trades={trades}
        dailyNotes={snapshot.dailyNotes}
        source={snapshot.source}
        initialDateKey={initialDateKey}
        initialFocusValue={initialFocusValue}
      />
    </AppShell>
  )
}
