import { Suspense } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { DashboardOverview } from '@/components/dashboard/dashboard-overview'
import { TradingCheckIn } from '@/components/daily-notes/trading-check-in'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalLocale } from '@/lib/server/journal-locale'
import { getDashboardSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { getBerlinTodayDateKey } from '@/lib/utils/daily-notes'
import type { DashboardSearchParams } from '@/lib/utils/dashboard'

export const dynamic = 'force-dynamic'

async function DashboardContent({ params }: { params?: Promise<DashboardSearchParams> }) {
  const [access, locale] = await Promise.all([getJournalAccess(), getJournalLocale()])
  const snapshot = await getDashboardSnapshotServer(access.user?.id)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))
  const today = getBerlinTodayDateKey()

  return (
    <DashboardOverview
      trades={trades}
      dailyNotes={snapshot.dailyNotes}
      source={snapshot.source}
      availability={snapshot.availability}
      locale={locale}
      params={await params}
      today={today}
      checkIn={access.mode === 'supabase' ? <TradingCheckIn dateKey={today} /> : undefined}
    />
  )
}

function DashboardFallback() {
  return (
    <div className="space-y-5">
      <FuturisticCard glow="none" className="p-6 xl:p-7">
        <div className="animate-pulse space-y-5">
          <div className="h-3 w-28 rounded-full bg-white/10" />
          <div className="h-10 w-72 max-w-full rounded-2xl bg-white/10" />
          <div className="h-4 w-full max-w-xl rounded-full bg-white/[0.07]" />
        </div>
      </FuturisticCard>
      <div className="grid animate-pulse gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-24 rounded-[1.1rem] border border-white/[0.06] bg-white/[0.035]" />)}
      </div>
    </div>
  )
}

export default function DashboardPage({ searchParams }: { searchParams?: Promise<DashboardSearchParams> }) {
  return (
    <AppShell>
      <Suspense fallback={<DashboardFallback />}>
        <DashboardContent params={searchParams} />
      </Suspense>
    </AppShell>
  )
}
