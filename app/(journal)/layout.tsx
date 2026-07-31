import { Suspense } from 'react'
import { JournalShell } from '@/components/layout/app-shell'
import { PerformanceNavigationTracker } from '@/components/performance/performance-navigation-tracker'
import { isPerformanceDiagnosticsEnabled } from '@/lib/server/performance-diagnostics'

export default function JournalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const diagnosticsEnabled = isPerformanceDiagnosticsEnabled()

  return (
    <>
      {diagnosticsEnabled ? (
        <Suspense fallback={null}>
          <PerformanceNavigationTracker />
        </Suspense>
      ) : null}
      <JournalShell>{children}</JournalShell>
    </>
  )
}
