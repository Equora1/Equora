import { AppShell } from '@/components/layout/app-shell'
import { CalendarOverview } from '@/components/calendar/calendar-overview'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalSnapshotServer } from '@/lib/server/journal'
import { mapDailyNoteRowToCalendarNote, mapTradeRowToTrade } from '@/lib/server/transformers'



export const dynamic = 'force-dynamic'

export default async function KalenderPage() {
  const access = await getJournalAccess()
  const snapshot = await getJournalSnapshotServer(access.user?.id)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))
  const dailyNotes = snapshot.dailyNotes.map(mapDailyNoteRowToCalendarNote)

  return <AppShell filteredTradesCount={trades.length} filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length} filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}><CalendarOverview trades={trades} dailyNotes={dailyNotes} /></AppShell>
}
