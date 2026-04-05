import Link from 'next/link'
import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { formatCurrency, formatPlainNumber } from '@/lib/utils/calculations'
import { getDateKeyFromDate, normalizeTradeDate } from '@/lib/utils/calendar'
import { buildDailyNoteFlowSummary, getBerlinTodayDateKey } from '@/lib/utils/daily-notes'
import type { ReviewSnapshot } from '@/lib/utils/review'

function formatDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateKey}T12:00:00`))
}

function getLatestActiveDateKey(trades: Trade[], dailyNotes: DailyNoteRow[]) {
  const tradeKeys = trades.map((trade) => getDateKeyFromDate(normalizeTradeDate(trade.createdAt ?? trade.date)))
  const noteKeys = dailyNotes.map((note) => note.trade_date).filter(Boolean)
  const uniqueKeys = Array.from(new Set([...tradeKeys, ...noteKeys])).sort()
  return uniqueKeys.at(-1) ?? getBerlinTodayDateKey()
}

function buildNextStep(daySummary: ReturnType<typeof buildDailyNoteFlowSummary>) {
  if (!daySummary.totalTrades) {
    return 'Kein Handelstag. Halte trotzdem kurz Marktgefühl, Fokus und bewusste Nicht-Trades fest.'
  }

  if (daySummary.incompleteTrades > 0) {
    return `${daySummary.incompleteTrades} Capture${daySummary.incompleteTrades === 1 ? '' : 's'} warten noch auf Vollständigung. Erst sauber machen, dann urteilen.`
  }

  if (!daySummary.existingNote) {
    return 'Die Zahlen sind da. Der nächste leichte Schritt ist eine kurze Tagesnotiz mit Fokus, Fehlerkern und einer Wiederholung für morgen.'
  }

  if (daySummary.trustedPnL < 0) {
    return 'Der Tag ist dokumentiert. Jetzt nur noch den eigentlichen Fehlerkern benennen, nicht den ganzen Tag neu erzählen.'
  }

  return 'Der Tag ist greifbar. Sichere nur noch, was morgen wiederholbar sein soll.'
}

function getDayTitle(daySummary: ReturnType<typeof buildDailyNoteFlowSummary>) {
  if (daySummary.dateKey === getBerlinTodayDateKey()) return 'Heute'
  return 'Letzter aktiver Tag'
}

export function ReviewRhythmCard({
  trades,
  dailyNotes,
  weeklySnapshot,
}: {
  trades: Trade[]
  dailyNotes: DailyNoteRow[]
  weeklySnapshot: ReviewSnapshot
}) {
  const activeDateKey = getLatestActiveDateKey(trades, dailyNotes)
  const daySummary = buildDailyNoteFlowSummary(trades, dailyNotes, activeDateKey)
  const dayTradeIds = daySummary.dayTrades.map((trade) => trade.id).join(',')
  const dayFocusHref = dayTradeIds
    ? `/trades?reviewTradeIds=${encodeURIComponent(dayTradeIds)}&reviewFocus=${encodeURIComponent(`Tagesreview · ${activeDateKey}`)}`
    : '/trades'
  const strongSignal = weeklySnapshot.topPerformers[0]
  const weakSignal = weeklySnapshot.weakSpots[0]
  const nextPlay = weeklySnapshot.playbook[0]

  return (
    <section className="mb-6 rounded-3xl border border-orange-400/15 bg-black/25 p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-orange-200/70">Review leichter lesen</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Tag links, Woche rechts. Mehr brauchst du für den ersten Review-Blick nicht.</h2>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Equora soll zuerst verständlich sein. Deshalb beginnt Review hier mit einem klaren Tagesanker und einem ruhigen Wochenfenster, nicht mit einer Analysewand.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-white/55">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{daySummary.totalTrades} Trades am Taganker</span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{weeklySnapshot.sessionDraft.tradeCount} Trades in 7 Tagen</span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Daily Notes: {dailyNotes.length}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[0.96fr_1.04fr]">
        <div className="rounded-3xl border border-orange-400/15 bg-orange-400/[0.05] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-100/70">{getDayTitle(daySummary)}</p>
              <h3 className="mt-3 text-xl font-semibold text-white">{formatDateLabel(activeDateKey)}</h3>
              <p className="mt-2 text-sm leading-6 text-white/62">{buildNextStep(daySummary)}</p>
            </div>
            <span className="rounded-full border border-orange-400/20 bg-black/30 px-3 py-1.5 text-xs text-orange-100/85">
              {daySummary.existingNote ? 'Notiz vorhanden' : 'Noch offen'}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MiniMetric label="Trades" value={String(daySummary.totalTrades)} tone="text-white" />
            <MiniMetric label="Belastbar" value={`${daySummary.trustedTrades.length}/${daySummary.totalTrades || 0}`} tone="text-emerald-300" />
            <MiniMetric label="P&L" value={formatCurrency(daySummary.trustedPnL)} tone={daySummary.trustedPnL >= 0 ? 'text-emerald-300' : daySummary.trustedPnL < 0 ? 'text-red-300' : 'text-white'} />
            <MiniMetric label="Setup" value={daySummary.dominantSetup ?? '—'} tone="text-orange-100/90" />
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Drei einfache Fragen</p>
            <div className="mt-3 space-y-2">
              {daySummary.prompts.slice(0, 3).map((prompt, index) => (
                <div key={prompt} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white/72">
                  <span className="mr-2 text-white/35">0{index + 1}</span>
                  {prompt}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/daily-note?date=${activeDateKey}`} className="rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-400/40 hover:text-white">
              Tagesnotiz öffnen
            </Link>
            <Link href={dayFocusHref} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
              Trades des Tages
            </Link>
            <Link href="/kalender" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
              Im Kalender lesen
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Letzte 7 Tage</p>
              <h3 className="mt-3 text-xl font-semibold text-white">{weeklySnapshot.headline}</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">{weeklySnapshot.summary}</p>
            </div>
            <Link href="/review-sessions" className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">
              Session-Hub
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Trades" value={String(weeklySnapshot.sessionDraft.tradeCount)} tone="text-white" />
            <MiniMetric label="Net P&L" value={formatCurrency(weeklySnapshot.sessionDraft.netPnL)} tone={weeklySnapshot.sessionDraft.netPnL >= 0 ? 'text-emerald-300' : weeklySnapshot.sessionDraft.netPnL < 0 ? 'text-red-300' : 'text-white'} />
            <MiniMetric label="Winrate" value={`${formatPlainNumber(weeklySnapshot.sessionDraft.winRate, 0)}%`} tone="text-orange-100/90" />
            <MiniMetric label="Ø R" value={`${formatPlainNumber(weeklySnapshot.sessionDraft.averageR, 2)}R`} tone={weeklySnapshot.sessionDraft.averageR >= 0 ? 'text-emerald-300' : 'text-red-300'} />
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <SignalCard label="Läuft gerade" title={strongSignal?.label ?? 'Noch kein klarer Stärke-Cluster'} detail={strongSignal ? `${strongSignal.value} · ${strongSignal.detail}` : 'Sobald genug Material da ist, zeigt Equora hier den saubersten Wiederholer.'} tone="emerald" />
            <SignalCard label="Aufpassen" title={weakSignal?.label ?? 'Noch kein dominanter Warnpunkt'} detail={weakSignal ? `${weakSignal.value} · ${weakSignal.detail}` : 'Warnmuster werden hier absichtlich einfach und konkret benannt.'} tone="red" />
            <SignalCard label="Nächster Hebel" title={nextPlay ?? 'Noch kein klarer Playbook-Hebel'} detail="Nur ein nächster Zug, nicht zehn Baustellen gleichzeitig." tone="orange" />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/review?periodPreset=7d" className="rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-400/40 hover:text-white">
              Wochenreview lesen
            </Link>
            <Link href={`/trades?reviewFocus=${encodeURIComponent('Wochenreview · Letzte 7 Tage')}`} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
              Passende Trades öffnen
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className={`mt-2 text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

function SignalCard({
  label,
  title,
  detail,
  tone,
}: {
  label: string
  title: string
  detail: string
  tone: 'emerald' | 'red' | 'orange'
}) {
  const toneClasses = tone === 'emerald'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
    : tone === 'red'
      ? 'border-red-400/20 bg-red-400/10 text-red-200'
      : 'border-orange-400/20 bg-orange-400/10 text-orange-100/90'

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${toneClasses}`}>{label}</span>
      <p className="mt-3 text-sm font-medium text-white">{title}</p>
      <p className="mt-2 text-xs leading-5 text-white/55">{detail}</p>
    </div>
  )
}
