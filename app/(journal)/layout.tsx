import { Suspense } from 'react'
import { TradingCheckInAfterLogin } from '@/components/daily-notes/trading-check-in'
import { JournalShell } from '@/components/layout/app-shell'
import { PerformanceNavigationTracker } from '@/components/performance/performance-navigation-tracker'
import { isPerformanceDiagnosticsEnabled } from '@/lib/server/performance-diagnostics'
import { getJournalLocale } from '@/lib/server/journal-locale'
import { replayStorageEnabled } from '@/lib/server/tradingview-replay-storage'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { getBerlinTodayDateKey } from '@/lib/utils/daily-notes'

export default async function JournalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const diagnosticsEnabled = isPerformanceDiagnosticsEnabled()
  const locale = await getJournalLocale()

  return (
    <>
      {diagnosticsEnabled ? (
        <Suspense fallback={null}>
          <PerformanceNavigationTracker />
        </Suspense>
      ) : null}
      <JournalShell locale={locale} replayEnabled={replayStorageEnabled()}>
        {children}
        {hasSupabaseClientEnv() && <TradingCheckInAfterLogin dateKey={getBerlinTodayDateKey()} />}
      </JournalShell>
    </>
  )
}
