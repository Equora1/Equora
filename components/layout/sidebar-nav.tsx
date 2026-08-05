'use client'

import { useEffect, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { AppIcon, type AppIconName } from '@/components/ui/app-icon'

const primaryNavItems = [
  { label: 'Start', href: '/dashboard', icon: 'dashboard', hint: 'Heute, P&L und nächster Schritt' },
  { label: 'Trades', href: '/trades', icon: 'trades', hint: 'Ledger, Erfassung und Details' },
  { label: 'Review', href: '/review', icon: 'review', hint: 'Heute, Woche und Verhalten prüfen' },
  { label: 'Statistik', href: '/statistik', icon: 'stats', hint: 'Setups, Zeiten und Muster lesen' },
  { label: 'Setups', href: '/setups', icon: 'setups', hint: 'Regeln, Bilder und Setup-Wirkung' },
] satisfies NavItem[]

const advancedNavItems = [
  { label: 'Kalender', href: '/kalender', icon: 'calendar', hint: 'Trades nach Tagen sehen' },
  { label: 'Sessions', href: '/review-sessions', icon: 'sessions', hint: 'Reviews bündeln und vergleichen' },
  { label: 'Vault', href: '/share', icon: 'vault', hint: 'Geteilte Trades & Community-Setups' },
  { label: 'Kosten', href: '/cost-profiles', icon: 'cost', hint: 'Gebühren und Kostenprofile' },
  { label: 'Daily Note', href: '/daily-note', icon: 'note', hint: 'Optionale Tagesnotiz' },
  { label: 'Broker verbinden', href: '/broker-sync', icon: 'sync', hint: 'Historische Brokerdaten für einen Scope vorbereiten' },
] satisfies NavItem[]

type NavItem = { label: string; href: string; icon: AppIconName; hint?: string }
type OverviewCounts = { trades: number; aSetups: number; losses: number }

export function SidebarNav() {
  const pathname = usePathname()
  const [activeCapture, setActiveCapture] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(() => advancedNavItems.some((item) => item.href === pathname))
  const [showOverview, setShowOverview] = useState(false)
  const [overview, setOverview] = useState<OverviewCounts | null>(null)
  const [overviewState, setOverviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    setActiveCapture(new URLSearchParams(window.location.search).get('capture'))
    setPendingHref(null)
    if (advancedNavItems.some((item) => item.href === pathname)) setShowAdvanced(true)
  }, [pathname])

  useEffect(() => {
    if (!showOverview || overviewState !== 'idle') return

    const controller = new AbortController()
    setOverviewState('loading')

    fetch('/api/sidebar-overview', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Overview request failed: ${response.status}`)
        return response.json() as Promise<OverviewCounts>
      })
      .then((data) => {
        setOverview(data)
        setOverviewState('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setOverviewState('error')
      })

    return () => controller.abort()
  }, [overviewState, showOverview])

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const targetPath = href.split('?')[0].split('#')[0]
    if (targetPath !== pathname) {
      setPendingHref(href)
    }
  }

  return (
    <div className="space-y-4">
      <FuturisticCard glow="orange" className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eq-display text-[0.62rem] text-[#b09a7a]">Journal</p>
            <h1 className="eq-display eq-text-gradient mt-3 text-[1.95rem] leading-none">Equora</h1>
          </div>
          <div className="rounded-2xl border border-[#c8823a]/20 bg-[#c8823a]/10 p-2.5 text-[#f0a855]">
            <AppIcon name="spark" className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </FuturisticCard>

      <FuturisticCard className="p-3">
        <NavSection
          items={primaryNavItems}
          pathname={pathname}
          activeCapture={activeCapture}
          pendingHref={pendingHref}
          onNavigate={handleNavigation}
        />

        <section className="mt-3 rounded-2xl border border-white/8 bg-white/[0.02] p-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-white/75 transition hover:text-white"
            aria-expanded={showAdvanced}
          >
            <span>Erweitert</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
              {showAdvanced ? 'Ausblenden' : 'Anzeigen'}
            </span>
          </button>
          {showAdvanced ? (
            <div className="mt-2">
              <NavSection
                items={advancedNavItems}
                pathname={pathname}
                activeCapture={activeCapture}
                pendingHref={pendingHref}
                onNavigate={handleNavigation}
                compact
              />
            </div>
          ) : null}
        </section>
      </FuturisticCard>

      <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-3">
        <button
          type="button"
          onClick={() => setShowOverview((current) => !current)}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-white/75 transition hover:text-white"
          aria-expanded={showOverview}
        >
          <span>Kurzüberblick</span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
            {showOverview ? 'Ausblenden' : 'Anzeigen'}
          </span>
        </button>
        {showOverview ? (
          <div className="mt-2 grid gap-2.5 text-sm" aria-live="polite">
            <MiniMetric label="Trades" value={overview?.trades ?? null} loading={overviewState === 'loading'} />
            <MiniMetric label="A-Setups" value={overview?.aSetups ?? null} loading={overviewState === 'loading'} />
            <MiniMetric label="Verluste" value={overview?.losses ?? null} loading={overviewState === 'loading'} />
            {overviewState === 'error' ? (
              <button
                type="button"
                onClick={() => setOverviewState('idle')}
                className="rounded-xl border border-[#c8823a]/20 bg-[#c8823a]/5 px-3 py-2 text-xs text-[#f0a855] transition hover:bg-[#c8823a]/10"
              >
                Zahlen erneut laden
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <FuturisticCard className="p-3">
        <Link
          href="/logout"
          prefetch={false}
          title="Logout"
          className="flex w-full items-center justify-between rounded-xl border border-[#221e1a] bg-[#1f1c1a]/45 px-4 py-3 text-left text-sm text-[#b09a7a] transition hover:border-[#c8823a]/20 hover:bg-[#1f1c1a]/70 hover:text-white"
        >
          <span className="flex items-center gap-3 font-medium">
            <span className="rounded-xl border border-white/8 bg-white/[0.03] p-2 text-[#f0a855]">
              <AppIcon name="logout" aria-hidden="true" />
            </span>
            Logout
          </span>
          <span className="text-[#998a72]">
            <AppIcon name="arrow" aria-hidden="true" />
          </span>
        </Link>
      </FuturisticCard>
    </div>
  )
}

function NavSection({
  items,
  pathname,
  activeCapture,
  pendingHref,
  onNavigate,
  compact = false,
}: {
  items: NavItem[]
  pathname: string
  activeCapture: string | null
  pendingHref: string | null
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void
  compact?: boolean
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const itemPathname = item.href.split('?')[0].split('#')[0]
        const itemCapture = item.href.includes('capture=import') ? 'import' : null
        const isActive = itemCapture
          ? pathname === itemPathname && activeCapture === itemCapture
          : pathname === itemPathname && activeCapture !== 'import'
        const isPending = pendingHref === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(event) => onNavigate(event, item.href)}
            title={item.hint ? `${item.label}: ${item.hint}` : item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`group flex w-full items-center justify-between rounded-xl border px-3 ${compact ? 'py-2.5' : 'py-3'} text-left text-sm transition ${
              isActive
                ? 'border-[#c8823a]/35 bg-[linear-gradient(135deg,rgba(240,168,85,0.18),rgba(200,130,58,0.12))] text-white'
                : 'border-[#221e1a] bg-[#1f1c1a]/45 text-[#b09a7a] hover:border-[#c8823a]/20 hover:bg-[#1f1c1a]/70 hover:text-white'
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={`rounded-xl border p-2 ${
                  isActive ? 'border-white/10 bg-white/10 text-white' : 'border-white/8 bg-white/[0.03] text-[#f0a855]'
                }`}
              >
                <AppIcon name={item.icon} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.label}</span>
                {item.hint ? <span className="mt-0.5 block truncate text-[11px] text-white/35">{item.hint}</span> : null}
              </span>
            </span>
            {isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#f0a855]/25 border-t-[#f0a855]" aria-label="Seite wird geladen" />
            ) : (
              <span className={`${isActive ? 'text-white/65' : 'text-[#998a72] group-hover:text-[#f0a855]'}`}>
                <AppIcon name="arrow" aria-hidden="true" />
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

function MiniMetric({ label, value, loading }: { label: string; value: number | null; loading: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#221e1a] bg-[#1f1c1a]/45 px-4 py-3">
      <span className="text-[#998a72]">{label}</span>
      {loading ? <span className="h-4 w-8 animate-pulse rounded bg-white/10" /> : <span className="text-white">{value ?? '–'}</span>}
    </div>
  )
}
