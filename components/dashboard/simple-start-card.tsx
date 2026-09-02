import Link from 'next/link'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { AppIcon, type AppIconName } from '@/components/ui/app-icon'
import { brokerFileImportCapability } from '@/lib/utils/broker-file-import-capability'

type Action = {
  href: string
  title: string
  icon: AppIconName
  hint?: string
}

export function SimpleStartCard({
  tradeCount = 0,
  trustedTradeCount = 0,
  evidenceLabel = 'Kleine Stichprobe',
}: {
  tradeCount?: number
  trustedTradeCount?: number
  evidenceLabel?: string
}) {
  const mainAction: Action = { href: '/trades?focus=ledger#ledger-capture', title: 'Trade erfassen', icon: 'trades' }
  const secondaryActions: Action[] = [
    ...(brokerFileImportCapability.previewEnabled
      ? [{
          href: brokerFileImportCapability.previewHref,
          title: brokerFileImportCapability.previewActionLabel,
          icon: 'scan' as const,
          hint: brokerFileImportCapability.blockedReason,
        }]
      : []),
    { href: '/broker-sync', title: 'Broker', icon: 'sync' },
    { href: '/review', title: 'Review', icon: 'review' },
  ]

  return (
    <FuturisticCard glow="orange" className="p-5 sm:p-6 xl:p-7">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eq-pill px-3 py-1.5 text-[10px] uppercase tracking-[0.18em]">Performance Center</span>
            <span className="eq-pill-soft px-3 py-1.5 text-[10px] uppercase tracking-[0.16em]">Letzte {tradeCount} Trades</span>
            <span className="eq-pill-soft px-3 py-1.5 text-[10px] uppercase tracking-[0.16em]">{evidenceLabel}</span>
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl xl:text-[2.75rem]">
            Dein Trading. <span className="eq-text-gradient">Klar im Blick.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
            Performance, Prozess und Datenqualität in einer Ansicht. Kennzahlen basieren auf {trustedTradeCount} belastbaren Abschlüssen und bleiben bei unklarer Währung gesperrt.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 xl:max-w-[430px] xl:justify-end">
          <StartAction action={mainAction} primary />
          {secondaryActions.map((action) => <StartAction key={action.href} action={action} />)}
        </div>
      </div>
    </FuturisticCard>
  )
}

function StartAction({ action, primary = false }: { action: Action; primary?: boolean }) {
  return (
    <Link
      href={action.href}
      title={action.hint}
      className={`group inline-flex min-h-11 items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60 ${
        primary
          ? 'border-[#c8823a]/40 bg-[linear-gradient(135deg,#f0a855,#b56c2d)] text-[#090909] shadow-[0_10px_30px_rgba(200,130,58,0.18)] hover:brightness-105'
          : 'border-white/10 bg-white/[0.035] text-white/72 hover:border-[#c8823a]/25 hover:bg-[#c8823a]/[0.07] hover:text-white'
      }`}
    >
      <AppIcon name={action.icon} className="h-4 w-4" aria-hidden="true" />
      <span>{action.title}</span>
    </Link>
  )
}
