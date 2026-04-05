import Link from 'next/link'
import { SectionHeader } from '@/components/layout/section-header'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { AppIcon, type AppIconName } from '@/components/ui/app-icon'
import type { SetupRow, DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'

type SimpleStartCardProps = {
  trades: Trade[]
  setups: SetupRow[]
  dailyNotes: DailyNoteRow[]
}

type SecondaryAction = {
  href: string
  title: string
  copy: string
  kicker: string
  icon: AppIconName
}

export function SimpleStartCard({ trades, setups, dailyNotes }: SimpleStartCardProps) {
  const lastTrade = trades[0]
  const lastSetup = setups[0]
  const openReviewSignal = trades.filter((trade) => trade.reviewLesson || trade.reviewState || trade.ruleCheck).length

  const primaryHref = '/trades'
  const primaryTitle = lastTrade ? 'Weiter im Workspace' : 'Trade erfassen'
  const primaryCopy = lastTrade
    ? 'Der schnellste Weg bleibt derselbe: öffnen, prüfen, weiterarbeiten.'
    : 'Erst sichern. Dann später ergänzen. Ohne Formularwand.'
  const primaryKicker = lastTrade
    ? `${lastTrade.market || 'Trade'} · ${lastTrade.direction || 'ohne Richtung'}${lastTrade.setup ? ` · ${lastTrade.setup}` : ''}`
    : 'Noch kein Trade gespeichert'

  const secondaryActions: SecondaryAction[] = [
    {
      href: '/trades?capture=import#trade-editor',
      title: 'CSV importieren',
      copy: 'Bestehende Trades als Datei übernehmen.',
      kicker: trades.length ? 'Datei prüfen und im Workspace landen' : 'Ideal für deinen ersten Datenblock',
      icon: 'scan',
    },
    {
      href: '/review',
      title: 'Review öffnen',
      copy: 'Kurzer Rückblick statt Analysepalast.',
      kicker: openReviewSignal ? `${openReviewSignal} Trades mit Review-Signal` : dailyNotes.length ? `${dailyNotes.length} Notizen vorhanden` : 'Kann warten, bis Material da ist',
      icon: 'review',
    },
    {
      href: '/setups',
      title: 'Setup anlegen',
      copy: 'Playbook pflegen, wenn der Kernfluss sitzt.',
      kicker: lastSetup ? lastSetup.title : 'Noch kein Setup gespeichert',
      icon: 'playbook',
    },
  ]

  return (
    <FuturisticCard glow="orange" className="p-5 xl:p-6">
      <SectionHeader
        eyebrow="Start"
        title="Ein klarer nächster Zug reicht"
        copy="Ein Hauptweg. Drei Nebenwege. Mehr muss das Dashboard gerade nicht sein."
        badge="Leicht starten"
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Link
          href={primaryHref}
          prefetch={false}
          className="group rounded-[30px] border border-orange-400/20 bg-orange-400/[0.06] p-6 transition hover:border-orange-400/35 hover:bg-orange-400/[0.1]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-orange-100/70">Hauptweg</p>
              <h3 className="mt-3 text-3xl font-semibold text-white">{primaryTitle}</h3>
            </div>
            <span className="rounded-2xl border border-orange-400/20 bg-black/20 p-3 text-orange-100 transition group-hover:border-orange-400/35 group-hover:bg-orange-400/10">
              <AppIcon name="trades" className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72">{primaryCopy}</p>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-white/52">
            <span className="line-clamp-2">{primaryKicker}</span>
            <span className="rounded-full border border-orange-400/25 bg-orange-400/12 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-orange-100/90 group-hover:border-orange-400/40">
              Jetzt öffnen
            </span>
          </div>
        </Link>

        <div className="grid gap-3">
          {secondaryActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              prefetch={false}
              className="group rounded-[24px] border border-white/10 bg-black/25 p-4 transition hover:border-orange-400/25 hover:bg-orange-400/[0.05]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white">{action.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/60">{action.copy}</p>
                </div>
                <span className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 text-orange-200 transition group-hover:border-orange-400/25 group-hover:bg-orange-400/10">
                  <AppIcon name={action.icon} className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-4 text-xs text-white/45">{action.kicker}</p>
            </Link>
          ))}
        </div>
      </div>
    </FuturisticCard>
  )
}
