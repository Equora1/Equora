import Link from 'next/link'
import { AppShell } from '@/components/layout/app-shell'
import { SimpleStartCard } from '@/components/dashboard/simple-start-card'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { getTrustedTrades } from '@/lib/utils/trade-trust'
import { AppIcon } from '@/components/ui/app-icon'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const access = await getJournalAccess()
  const snapshot = await getJournalSnapshotServer(access.user?.id)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))
  const trustedTrades = getTrustedTrades(trades)

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trustedTrades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <div className="space-y-6">
        <SimpleStartCard trades={trades} setups={snapshot.setupRows} dailyNotes={snapshot.dailyNotes} />

        <section className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Gerade im Blick</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Nur der nötige Lageblick</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">Das Dashboard bleibt Startpunkt. Tiefe liegt in Trades, Kalender und Review, nicht mehr hinter einem einzigen Aufklappen.</p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <SignalPill icon="trades" label="Trades" value={trades.length ? `${trades.length} im Journal` : 'Noch leer'} />
                <SignalPill icon="playbook" label="Setups" value={snapshot.setupRows.length ? `${snapshot.setupRows.length} vorhanden` : 'Noch leer'} />
                <SignalPill icon="review" label="Review" value={snapshot.dailyNotes.length ? `${snapshot.dailyNotes.length} Notizen bereit` : 'Später, wenn Material da ist'} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <QuickLink href="/kalender" title="Kalender" copy="Tage lesen statt suchen." />
              <QuickLink href="/daily-note" title="Daily Note" copy="Tag kurz abschließen." />
              <QuickLink href="/review-sessions" title="Sessions" copy="Gespeicherte Review-Spuren." />
              <QuickLink href="/statistik" title="Statistik" copy="Zahlen erst bei Bedarf." />
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  )
}

function SignalPill({ icon, label, value }: { icon: 'trades' | 'playbook' | 'review'; label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
          <p className="mt-2 text-sm font-medium text-white/80">{value}</p>
        </div>
        <span className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 text-orange-200">
          <AppIcon name={icon} className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </div>
  )
}

function QuickLink({ href, title, copy }: { href: string; title: string; copy: string }) {
  return (
    <Link href={href} className="rounded-[24px] border border-white/10 bg-black/25 p-4 transition hover:border-orange-400/25 hover:bg-orange-400/[0.04]">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/58">{copy}</p>
    </Link>
  )
}
