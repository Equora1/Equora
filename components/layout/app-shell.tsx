import { SidebarNav } from '@/components/layout/sidebar-nav'

type AppShellProps = {
  children: React.ReactNode
  filteredTradesCount?: number
  filteredASetupsCount?: number
  filteredLossesCount?: number
  contentWidth?: 'default' | 'wide'
}

type JournalShellProps = {
  children: React.ReactNode
  contentWidth?: 'default' | 'wide'
}

/**
 * Compatibility wrapper for page components created before the persistent
 * journal layout. The visible shell now lives in app/(journal)/layout.tsx so
 * it can remain mounted while page data streams in.
 */
export function AppShell({ children }: AppShellProps) {
  return <>{children}</>
}

export function JournalShell({ children, contentWidth = 'wide' }: JournalShellProps) {
  const widthClass = contentWidth === 'wide' ? 'max-w-[1880px]' : 'max-w-7xl'

  return (
    <div className="min-h-screen bg-[var(--eq-bg)] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_92%_0%,rgba(240,168,85,0.09),transparent_27%),radial-gradient(circle_at_5%_100%,rgba(160,104,40,0.07),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.008),transparent_32%)]" />
      <div className={`relative mx-auto ${widthClass} px-3 py-3 sm:px-5 sm:py-5 lg:px-6 xl:px-7 xl:py-6 2xl:px-9`}>
        <div className="grid min-w-0 gap-4 xl:grid-cols-[272px_minmax(0,1fr)] xl:gap-6 2xl:grid-cols-[284px_minmax(0,1fr)]">
          <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
            <SidebarNav />
          </aside>
          <main className="min-w-0 space-y-5 pb-8 xl:space-y-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
