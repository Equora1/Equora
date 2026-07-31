import Link from 'next/link'

function toneClasses(tone: 'emerald' | 'red' | 'orange') {
  if (tone === 'emerald') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
  if (tone === 'red') return 'border-red-400/20 bg-red-400/10 text-red-200'
  return 'border-orange-400/20 bg-orange-400/10 text-orange-100/90'
}

type HeatmapData = {
  weekdays: string[]
  tags: string[]
  cells: {
    weekday: string
    tag: string
    tradeCount: number
    netPnL: number
    intensity: number
    tone: 'emerald' | 'red' | 'orange'
    href?: string
  }[]
}

function formatPnL(value: number) {
  const formatted = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value))

  if (value > 0) return `+${formatted} €`
  if (value < 0) return `-${formatted} €`
  return '±0 €'
}

export function TagHeatmapCard({ data }: { data: HeatmapData }) {
  const cellMap = new Map(data.cells.map((cell) => [`${cell.weekday}__${cell.tag}`, cell]))

  return (
    <div className="rounded-3xl border border-white/10 bg-black/40 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Tag Heatmap</h3>
          <p className="mt-1 text-sm text-white/50">Wochentage gegen die aktivsten Tags im Review-Zeitraum</p>
        </div>
        <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2.5 py-1 text-[11px] text-orange-100/80">grün glüht, rot warnt</span>
      </div>

      {data.tags.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[720px] space-y-2">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `140px repeat(${data.tags.length}, minmax(0, 1fr))` }}
            >
              <div className="px-3 py-2 text-[11px] uppercase tracking-[0.22em] text-white/35">Wochentag</div>
              {data.tags.map((tag) => (
                <div key={tag} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center text-xs font-medium text-white/80">
                  {tag}
                </div>
              ))}
            </div>

            {data.weekdays.map((weekday) => (
              <div
                key={weekday}
                className="grid gap-2"
                style={{ gridTemplateColumns: `140px repeat(${data.tags.length}, minmax(0, 1fr))` }}
              >
                <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/75">
                  {weekday}
                </div>

                {data.tags.map((tag) => {
                  const cell = cellMap.get(`${weekday}__${tag}`)
                  const classes = toneClasses(cell?.tone ?? 'orange')
                  const opacity = cell?.tradeCount ? 0.35 + cell.intensity * 0.65 : 0.35
                  const card = (
                    <div
                      className={`rounded-2xl border px-3 py-3 transition ${classes} ${cell?.href ? 'hover:border-white/25 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.04)]' : ''}`}
                      style={{ opacity }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] uppercase tracking-[0.16em] text-white/45">Trades</span>
                        <span className="text-base font-semibold text-white">{cell?.tradeCount ?? 0}</span>
                      </div>
                      <p className="mt-3 text-sm text-white/85">{cell ? formatPnL(cell.netPnL) : '±0 €'}</p>
                      {cell?.href ? <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/35">Drilldown öffnen</p> : null}
                    </div>
                  )

                  return cell?.href ? (
                    <Link key={`${weekday}-${tag}`} href={cell.href}>
                      {card}
                    </Link>
                  ) : (
                    <div key={`${weekday}-${tag}`}>{card}</div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/55">
          Noch zu wenig Tag-Daten für eine Heatmap. Sobald im Review-Zeitraum mehrere sauber getaggte Trades liegen, glühen hier die aktiven Muster auf.
        </div>
      )}
    </div>
  )
}
