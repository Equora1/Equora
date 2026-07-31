import { PatternFinderCard } from '@/components/analytics/pattern-finder-card'
import { TopPerformerCard } from '@/components/analytics/top-performer-card'
import { WeakSpotsCard } from '@/components/analytics/weak-spots-card'

export function EdgeFinder({ topPerformer, weakSpots, patternFinder, conceptPerformance, activeLabel = 'Trades aktiv' }: { topPerformer: { label: string; value: string; detail: string }[]; weakSpots: { label: string; value: string; detail: string }[]; patternFinder: string[]; conceptPerformance: { concept: string; winRate: string; pnl: string; avgR: string; tone: 'green' | 'red' }[]; activeLabel?: string }) {
  const leadConcept = conceptPerformance[0]
  const remainingConcepts = conceptPerformance.slice(1, 5)

  return (
    <section className="rounded-[30px] border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.25em] text-white/45">Edge Finder</p>
          <h2 className="mt-2 text-2xl font-semibold text-orange-300">Wo trägt dein Spiel. Wo knickt es weg.</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Statt lauter gleich lauter Kärtchen liegt hier erst der Schwerpunkt offen, danach die Reibung. So sieht man schneller, woran der nächste Hebel hängt.
          </p>
        </div>
        <div className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/80">{activeLabel}</div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="rounded-[28px] border border-orange-400/15 bg-black/40 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-200/70">Leitplanke</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Stärkstes Konzept im aktuellen Fenster</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
                Das ist die erste Spur, der du in der nächsten Session folgen solltest, bevor du tiefer in Märkte, Tags und Sonderfälle abbiegst.
              </p>
            </div>
            {leadConcept ? (
              <span className={`rounded-full border px-3 py-1 text-xs ${leadConcept.tone === 'green' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-red-400/20 bg-red-400/10 text-red-300'}`}>
                {leadConcept.pnl}
              </span>
            ) : null}
          </div>

          {leadConcept ? (
            <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-2xl font-semibold text-white">{leadConcept.concept}</p>
                  <p className="mt-2 text-sm text-white/60">Win Rate {leadConcept.winRate} · Avg R {leadConcept.avgR}</p>
                </div>
                <div className="w-full max-w-xs">
                  <div className="h-2 rounded-full bg-white/8">
                    <div className={leadConcept.tone === 'green' ? 'h-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.55)]' : 'h-2 rounded-full bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.5)]'} style={{ width: leadConcept.tone === 'green' ? '78%' : '42%' }} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-sm text-white/55">
              Noch keine belastbare Konzeptspur sichtbar.
            </div>
          )}

          {remainingConcepts.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {remainingConcepts.map((item) => (
                <div key={item.concept} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.concept}</p>
                      <p className="mt-1 text-xs text-white/45">Win Rate {item.winRate} · Avg R {item.avgR}</p>
                    </div>
                    <span className={item.tone === 'green' ? 'text-emerald-300' : 'text-red-300'}>{item.pnl}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">
          <TopPerformerCard items={topPerformer} />
          <WeakSpotsCard items={weakSpots} />
          <PatternFinderCard items={patternFinder} />
        </div>
      </div>
    </section>
  )
}
