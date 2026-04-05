import { SidebarNav } from '@/components/layout/sidebar-nav'
type AppShellProps = {
  children: React.ReactNode
  filteredTradesCount: number
  filteredASetupsCount: number
  filteredLossesCount: number
  contentWidth?: 'default' | 'wide'
}

export function AppShell({
  children,
  filteredTradesCount,
  filteredASetupsCount,
  filteredLossesCount,
  contentWidth = 'wide',
}: AppShellProps) {
  const widthClass = contentWidth === 'wide' ? 'max-w-[1720px]' : 'max-w-7xl'

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(240,168,85,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(200,130,58,0.10),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.01),transparent_34%)]" />
      <div className={`relative mx-auto ${widthClass} px-4 py-5 sm:px-6 sm:py-6 lg:px-8 xl:px-10 xl:py-8 2xl:px-12`}>
        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)] xl:gap-7 2xl:grid-cols-[320px_minmax(0,1fr)] 2xl:gap-8">
          <aside className="xl:sticky xl:top-5 xl:self-start">
            <SidebarNav
              filteredTradesCount={filteredTradesCount}
              filteredASetupsCount={filteredASetupsCount}
              filteredLossesCount={filteredLossesCount}
            />
          </aside>
          <main className="min-w-0 space-y-5 xl:space-y-6 2xl:space-y-7">{children}</main>
        </div>
      </div>
    </div>
  )
}
