import { isCalendarDateKey } from '@/lib/utils/calendar'
import { getBerlinTodayDateKey } from '@/lib/utils/daily-notes'
import { AppShell } from '@/components/layout/app-shell'
import { DailyNoteFlowCard } from '@/components/daily-notes/daily-note-flow-card'
import { getJournalAccess } from '@/lib/server/auth'
import { getDailyNoteSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { buildLinkedSetupByTradeId } from '@/lib/utils/trade-setup-links'

export const dynamic = 'force-dynamic'

export default async function DailyNotePage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const date = Array.isArray(params?.date) ? params.date[0] : params?.date
  const initialDateKey = isCalendarDateKey(date) ? date : getBerlinTodayDateKey()
  const access = await getJournalAccess()
  const snapshot = await getDailyNoteSnapshotServer(access.user?.id)
  const linkedSetupByTradeId = buildLinkedSetupByTradeId(snapshot.setupRows, snapshot.setupTradeLinkRows)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row, [], linkedSetupByTradeId[row.id] ?? null))

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <DailyNoteFlowCard key={initialDateKey} trades={trades} dailyNotes={snapshot.dailyNotes} source={snapshot.source} initialDateKey={initialDateKey} />
    </AppShell>
  )
}
