import Link from 'next/link'

function toneClasses(tone: 'emerald' | 'red' | 'orange') {
  if (tone === 'emerald') return 'border-emerald-400/15 bg-emerald-400/5 text-emerald-300'
  if (tone === 'red') return 'border-red-400/15 bg-red-400/5 text-red-300'
  return 'border-orange-400/15 bg-orange-400/5 text-orange-200'
}

export function TagCombinationsCard({ items }: { items: { label: string; value: string; detail: string; tone: 'emerald' | 'red' | 'orange'; href?: string }[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/40 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Tag-Kombis</h3>
        <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2.5 py-1 text-[11px] text-orange-100/80">wenn Tags zusammen auftreten</span>
      </div>
      <div className="space-y-3">
        {items.map((item) => {
          const card = (
            <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 transition ${item.href ? 'hover:border-white/20 hover:bg-white/[0.07]' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">{item.label}</p>
                  <p className="mt-2 text-base font-semibold text-white">{item.value}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${toneClasses(item.tone)}`}>{item.tone === 'emerald' ? 'stark' : item.tone === 'red' ? 'warnung' : 'beobachten'}</span>
              </div>
              <p className="mt-3 text-sm text-white/65">{item.detail}</p>
              {item.href ? <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/35">Trades dazu öffnen</p> : null}
            </div>
          )

          return item.href ? (
            <Link key={`${item.label}-${item.value}`} href={item.href}>
              {card}
            </Link>
          ) : (
            <div key={`${item.label}-${item.value}`}>{card}</div>
          )
        })}
      </div>
    </div>
  )
}
