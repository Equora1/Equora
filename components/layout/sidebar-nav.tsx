'use client'

import { useEffect, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { AppIcon, type AppIconName } from '@/components/ui/app-icon'
import type { JournalLocale } from '@/lib/i18n/journal'

const primaryNavItems = [
  {
    href: '/dashboard', icon: 'dashboard',
    de: { label: 'Start', hint: 'Heute, P&L und nächster Schritt' },
    en: { label: 'Home', hint: 'Today, P&L and your next step' },
  },
  {
    href: '/trades', icon: 'trades',
    de: { label: 'Trades', hint: 'Trades erfassen und nachsehen' },
    en: { label: 'Trades', hint: 'Log and find trades' },
  },
  {
    href: '/review', icon: 'review',
    de: { label: 'Review', hint: 'Entscheidungen nachbereiten' },
    en: { label: 'Review', hint: 'Review your decisions' },
  },
  {
    href: '/statistik', icon: 'stats',
    de: { label: 'Statistik', hint: 'Ergebnisse und Muster ansehen' },
    en: { label: 'Statistics', hint: 'See results and patterns' },
  },
  {
    href: '/setups', icon: 'setups',
    de: { label: 'Setups', hint: 'Regeln und Beispiele festhalten' },
    en: { label: 'Setups', hint: 'Save rules and examples' },
  },
] satisfies NavItem[]

const advancedNavItems = [
  {
    href: '/kalender', icon: 'calendar',
    de: { label: 'Kalender', hint: 'Trades nach Tagen sehen' },
    en: { label: 'Calendar', hint: 'View trades by day' },
  },
  {
    href: '/review-sessions', icon: 'sessions',
    de: { label: 'Review-Sammlungen', hint: 'Reviews bündeln und vergleichen' },
    en: { label: 'Review collections', hint: 'Group and compare reviews' },
  },
  {
    href: '/share', icon: 'vault',
    de: { label: 'Teilen', hint: 'Trades und Setups teilen' },
    en: { label: 'Share', hint: 'Share trades and setups' },
  },
  {
    href: '/cost-profiles', icon: 'cost',
    de: { label: 'Kosten', hint: 'Gebühren und Kostenprofile' },
    en: { label: 'Costs', hint: 'Fees and cost profiles' },
  },
  {
    href: '/daily-note', icon: 'note',
    de: { label: 'Tagesnotiz', hint: 'Optionale Tagesnotiz' },
    en: { label: 'Daily note', hint: 'Optional note for the day' },
  },
  {
    href: '/broker-sync', icon: 'sync',
    de: { label: 'Broker verbinden', hint: 'Verbindungen und Dateiübernahme' },
    en: { label: 'Connect a broker', hint: 'Connections and file imports' },
  },
] satisfies NavItem[]

const settingsNavItems = [
  {
    href: '/settings', icon: 'settings',
    de: { label: 'Einstellungen' },
    en: { label: 'Settings' },
  },
] satisfies NavItem[]

const navigationCopy = {
  de: {
    home: 'Equora Trading Journal – Startseite',
    openNavigation: 'Navigation öffnen',
    closeNavigation: 'Navigation schließen',
    menu: 'Menü',
    journalNavigation: 'Journal-Navigation',
    advanced: 'Erweitert',
    show: 'Anzeigen',
    hide: 'Ausblenden',
    overview: 'Kurzüberblick',
    losses: 'Verluste',
    retryOverview: 'Zahlen erneut laden',
    loading: 'Seite wird geladen',
    signOut: 'Abmelden',
  },
  en: {
    home: 'Equora Trading Journal – Home',
    openNavigation: 'Open navigation',
    closeNavigation: 'Close navigation',
    menu: 'Menu',
    journalNavigation: 'Journal navigation',
    advanced: 'More',
    show: 'Show',
    hide: 'Hide',
    overview: 'Quick overview',
    losses: 'Losses',
    retryOverview: 'Reload totals',
    loading: 'Loading page',
    signOut: 'Sign out',
  },
}

type NavItem = {
  href: string
  icon: AppIconName
} & Record<JournalLocale, { label: string; hint?: string }>
type OverviewCounts = { trades: number; aSetups: number; losses: number }

export function SidebarNav({ locale }: { locale: JournalLocale }) {
  const copy = navigationCopy[locale]
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeCapture = searchParams.get('capture')
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(() => advancedNavItems.some((item) => item.href === pathname))
  const [showOverview, setShowOverview] = useState(false)
  const [overview, setOverview] = useState<OverviewCounts | null>(null)
  const [overviewState, setOverviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    setPendingHref(null)
    setShowMobileMenu(false)
    if (advancedNavItems.some((item) => item.href === pathname)) setShowAdvanced(true)
  }, [activeCapture, pathname])

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
    <div className="space-y-3">
      <FuturisticCard glow="orange" className="p-4">
        <div className="flex items-start justify-between gap-4">
          <Link
            href="/dashboard"
            aria-label={copy.home}
            onClick={(event) => handleNavigation(event, '/dashboard')}
            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60"
          >
            <p className="text-[9px] uppercase tracking-[0.3em] text-white/60">Trading Journal</p>
            <span className="eq-display eq-text-gradient mt-2 block text-[1.55rem] leading-none">Equora</span>
          </Link>
          <button
            type="button"
            onClick={() => setShowMobileMenu((current) => !current)}
            className="flex items-center gap-2 rounded-xl border border-[#c8823a]/20 bg-[#c8823a]/10 px-3 py-2 text-sm text-[#f0a855] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60 xl:hidden"
            aria-expanded={showMobileMenu}
            aria-controls="journal-mobile-menu"
            aria-label={showMobileMenu ? copy.closeNavigation : copy.openNavigation}
          >
            <AppIcon name="spark" className="h-4 w-4" aria-hidden="true" />
            {copy.menu}
          </button>
          <div className="hidden rounded-xl border border-[#c8823a]/20 bg-[#c8823a]/10 p-2 text-[#f0a855] xl:block">
            <AppIcon name="spark" className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      </FuturisticCard>

      <div id="journal-mobile-menu" className={`${showMobileMenu ? 'block' : 'hidden'} space-y-3 xl:block`}>
        <FuturisticCard className="p-2.5">
          <nav aria-label={copy.journalNavigation}>
            <p className="px-3 pb-2 pt-1 text-[9px] uppercase tracking-[0.22em] text-white/60">Journal</p>
            <NavSection
              items={primaryNavItems}
              locale={locale}
              pathname={pathname}
              activeCapture={activeCapture}
              pendingHref={pendingHref}
              onNavigate={handleNavigation}
            />

            <section className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-1.5">
              <button
                type="button"
                onClick={() => setShowAdvanced((current) => !current)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-white/75 transition hover:text-white"
                aria-expanded={showAdvanced}
              >
                <span>{copy.advanced}</span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
                  {showAdvanced ? copy.hide : copy.show}
                </span>
              </button>
              {showAdvanced ? (
                <div className="mt-2">
                  <NavSection
                    items={advancedNavItems}
                    locale={locale}
                    pathname={pathname}
                    activeCapture={activeCapture}
                    pendingHref={pendingHref}
                    onNavigate={handleNavigation}
                    compact
                  />
                </div>
              ) : null}
            </section>
            <div className="mt-2">
              <NavSection
                items={settingsNavItems}
                locale={locale}
                pathname={pathname}
                activeCapture={activeCapture}
                pendingHref={pendingHref}
                onNavigate={handleNavigation}
              />
            </div>
          </nav>
        </FuturisticCard>

        <section className="rounded-2xl border border-white/[0.07] bg-[#0d0d0e]/92 p-2.5 shadow-[0_18px_45px_rgba(0,0,0,0.32)]">
          <button
            type="button"
            onClick={() => setShowOverview((current) => !current)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-white/75 transition hover:text-white"
            aria-expanded={showOverview}
          >
            <span>{copy.overview}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55">
              {showOverview ? copy.hide : copy.show}
            </span>
          </button>
          {showOverview ? (
            <div className="mt-2 grid gap-2.5 text-sm" aria-live="polite">
              <MiniMetric label="Trades" value={overview?.trades ?? null} loading={overviewState === 'loading'} />
              <MiniMetric label="A-Setups" value={overview?.aSetups ?? null} loading={overviewState === 'loading'} />
              <MiniMetric label={copy.losses} value={overview?.losses ?? null} loading={overviewState === 'loading'} />
              {overviewState === 'error' ? (
                <button
                  type="button"
                  onClick={() => setOverviewState('idle')}
                  className="rounded-xl border border-[#c8823a]/20 bg-[#c8823a]/5 px-3 py-2 text-xs text-[#f0a855] transition hover:bg-[#c8823a]/10"
                >
                  {copy.retryOverview}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <FuturisticCard className="p-2.5">
          <Link
            href="/logout"
            prefetch={false}
            title={copy.signOut}
            className="flex w-full items-center justify-between rounded-xl border border-[#221e1a] bg-[#1f1c1a]/45 px-4 py-3 text-left text-sm text-[#b09a7a] transition hover:border-[#c8823a]/20 hover:bg-[#1f1c1a]/70 hover:text-white"
          >
            <span className="flex items-center gap-3 font-medium">
              <span className="rounded-xl border border-white/8 bg-white/[0.03] p-2 text-[#f0a855]">
                <AppIcon name="logout" aria-hidden="true" />
              </span>
              {copy.signOut}
            </span>
            <span className="text-[#998a72]">
              <AppIcon name="arrow" aria-hidden="true" />
            </span>
          </Link>
        </FuturisticCard>
      </div>
    </div>
  )
}

function NavSection({
  items,
  locale,
  pathname,
  activeCapture,
  pendingHref,
  onNavigate,
  compact = false,
}: {
  items: NavItem[]
  locale: JournalLocale
  pathname: string
  activeCapture: string | null
  pendingHref: string | null
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void
  compact?: boolean
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const { label, hint } = item[locale]
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
            title={hint ? `${label}: ${hint}` : label}
            aria-current={isActive ? 'page' : undefined}
            className={`group flex w-full items-center justify-between rounded-xl border px-3 ${compact ? 'py-2.5' : 'py-2.5'} text-left text-sm transition ${
              isActive
                ? 'border-[#c8823a]/30 bg-[linear-gradient(135deg,rgba(240,168,85,0.14),rgba(200,130,58,0.07))] text-white shadow-[inset_3px_0_0_rgba(240,168,85,0.72)]'
                : 'border-transparent bg-transparent text-[#a99b88] hover:border-white/[0.06] hover:bg-white/[0.035] hover:text-white'
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={`rounded-xl border p-2 ${
                  isActive ? 'border-[#c8823a]/20 bg-[#c8823a]/10 text-[#f0a855]' : 'border-white/[0.06] bg-white/[0.025] text-[#c8a06f]'
                }`}
              >
                <AppIcon name={item.icon} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block whitespace-normal break-words font-medium">{label}</span>
                {hint ? <span className="mt-0.5 block whitespace-normal break-words text-[11px] text-white/60">{hint}</span> : null}
              </span>
            </span>
            {isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#f0a855]/25 border-t-[#f0a855]" aria-label={navigationCopy[locale].loading} />
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
