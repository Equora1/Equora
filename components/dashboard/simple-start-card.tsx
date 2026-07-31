import Link from 'next/link'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { AppIcon, type AppIconName } from '@/components/ui/app-icon'

type Action = {
  href: string
  title: string
  icon: AppIconName
}

export function SimpleStartCard() {
  const mainAction: Action = { href: '/trades?focus=ledger#ledger-capture', title: 'Trade erfassen', icon: 'trades' }
  const secondaryActions: Action[] = [
    { href: '/trades?capture=import#trade-editor', title: 'CSV importieren', icon: 'scan' },
    { href: '/review', title: 'Review starten', icon: 'review' },
  ]

  return (
    <FuturisticCard glow="orange" className="p-5 xl:p-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] xl:items-stretch">
        <Link
          href={mainAction.href}
          className="group flex min-h-[180px] items-end justify-between rounded-[30px] border border-orange-400/35 bg-[linear-gradient(135deg,rgba(240,168,85,0.18),rgba(240,168,85,0.06))] p-6 transition hover:border-orange-300/55 hover:bg-orange-400/[0.16]"
        >
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-orange-100/70">Start</p>
            <h2 className="eq-display mt-4 text-3xl text-orange-50 xl:text-4xl">{mainAction.title}</h2>
          </div>
          <span className="rounded-3xl border border-orange-300/25 bg-black/20 p-4 text-orange-100 transition group-hover:border-orange-300/45 group-hover:bg-orange-400/10">
            <AppIcon name={mainAction.icon} className="h-6 w-6" aria-hidden="true" />
          </span>
        </Link>

        <div className="grid gap-3 self-stretch">
          {secondaryActions.map((action) => (
            <StartAction key={action.href} action={action} />
          ))}
        </div>
      </div>
    </FuturisticCard>
  )
}

function StartAction({ action, compact = false }: { action: Action; compact?: boolean }) {
  return (
    <Link
      href={action.href}
      className={`group flex items-center justify-between rounded-[24px] border border-white/10 bg-black/25 ${compact ? 'p-3' : 'p-4'} transition hover:border-orange-400/25 hover:bg-orange-400/[0.05]`}
    >
      <p className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-white`}>{action.title}</p>
      <span className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 text-orange-200 transition group-hover:border-orange-400/25 group-hover:bg-orange-400/10">
        <AppIcon name={action.icon} className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  )
}
