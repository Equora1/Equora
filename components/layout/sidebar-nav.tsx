'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { AppIcon, type AppIconName } from '@/components/ui/app-icon'

const primaryNavItems = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Trades', href: '/trades', icon: 'trades' },
  { label: 'Setups', href: '/setups', icon: 'setups' },
  { label: 'Review', href: '/review', icon: 'review' },
] satisfies NavItem[]

const secondaryNavItems = [
  { label: 'Statistik', href: '/statistik', icon: 'stats' },
  { label: 'Equora Vault', href: '/share', icon: 'vault' },
  { label: 'Tagesnotiz', href: '/daily-note', icon: 'note' },
  { label: 'Sessions', href: '/review-sessions', icon: 'sessions' },
  { label: 'Kostenprofile', href: '/cost-profiles', icon: 'cost' },
  { label: 'Kalender', href: '/kalender', icon: 'calendar' },
] satisfies NavItem[]

type SidebarNavProps = {
  filteredTradesCount: number
  filteredASetupsCount: number
  filteredLossesCount: number
}

type NavItem = { label: string; href: string; icon: AppIconName }

export function SidebarNav({
  filteredTradesCount,
  filteredASetupsCount,
  filteredLossesCount,
}: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <div className="space-y-4">
      <FuturisticCard glow="orange" className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eq-display text-[0.62rem] text-[#b09a7a]">Equora</p>
            <h1 className="eq-display eq-text-gradient mt-3 text-[1.95rem] leading-none">Equora</h1>
          </div>
          <div className="rounded-2xl border border-[#c8823a]/20 bg-[#c8823a]/10 p-2.5 text-[#f0a855] shadow-[0_0_18px_rgba(200,130,58,0.15)]">
            <AppIcon name="spark" className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-[#998a72]">
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">Capture</span>
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">Review</span>
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">Coaching</span>
        </div>
      </FuturisticCard>

      <FuturisticCard className="p-3">
        <NavSection label="Primär" items={primaryNavItems} pathname={pathname} />
        <div className="my-3 h-px bg-white/6" />
        <NavSection label="Später / Kontext" items={secondaryNavItems} pathname={pathname} />
      </FuturisticCard>

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

      <FuturisticCard className="p-4">
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#998a72]">Heute aktiv</p>
        <div className="mt-4 space-y-3 text-sm">
          <MetricRow icon="trades" label="Trades" value={filteredTradesCount} tone="text-[#f0a855]" />
          <MetricRow icon="setups" label="A-Setups" value={filteredASetupsCount} tone="text-white" />
          <MetricRow icon="review" label="Verluste" value={filteredLossesCount} tone="text-[#e5484d]" />
        </div>
      </FuturisticCard>
    </div>
  )
}

function NavSection({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <div className="space-y-2">
      <p className="px-2 text-[10px] uppercase tracking-[0.24em] text-[#998a72]">{label}</p>
      {items.map((item) => {
        const isActive = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            title={item.label}
            className={`group flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition ${
              isActive
                ? 'border-[#c8823a]/35 bg-[linear-gradient(135deg,rgba(240,168,85,0.18),rgba(200,130,58,0.12))] text-white shadow-[0_0_24px_rgba(200,130,58,0.18)]'
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
              <span className="truncate font-medium">{item.label}</span>
            </span>
            <span className={`${isActive ? 'text-white/65' : 'text-[#998a72] group-hover:text-[#f0a855]'}`}>
              <AppIcon name="arrow" aria-hidden="true" />
            </span>
          </Link>
        )
      })}
    </div>
  )
}

function MetricRow({ icon, label, value, tone }: { icon: AppIconName; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#221e1a] bg-[#1f1c1a]/45 px-4 py-3">
      <span className="flex items-center gap-3 text-[#998a72]">
        <span className="rounded-xl border border-white/8 bg-white/[0.03] p-2 text-[#f0a855]">
          <AppIcon name={icon} aria-hidden="true" />
        </span>
        {label}
      </span>
      <span className={tone}>{value}</span>
    </div>
  )
}
