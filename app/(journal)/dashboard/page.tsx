import { Suspense } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { SimpleStartCard } from '@/components/dashboard/simple-start-card'
import { TodaySummaryCard } from '@/components/dashboard/today-summary-card'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { getJournalAccess } from '@/lib/server/auth'
import { getDashboardSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'

export const dynamic = 'force-dynamic'

async function DashboardTodaySummary() {
  const access = await getJournalAccess()
  const snapshot = await getDashboardSnapshotServer(access.user?.id)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))

  return <TodaySummaryCard trades={trades} dailyNotes={snapshot.dailyNotes} />
}

function TodaySummaryFallback() {
  return (
    <FuturisticCard glow="none" className="p-5 xl:p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-3 w-20 rounded-full bg-white/10" />
        <div className="h-8 w-52 rounded-2xl bg-white/10" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-24 rounded-[22px] bg-white/[0.05]" />
          <div className="h-24 rounded-[22px] bg-white/[0.05]" />
          <div className="h-24 rounded-[22px] bg-white/[0.05]" />
        </div>
      </div>
    </FuturisticCard>
  )
}

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <SimpleStartCard />
        <Suspense fallback={<TodaySummaryFallback />}>
          <DashboardTodaySummary />
        </Suspense>
      </div>
    </AppShell>
  )
}
