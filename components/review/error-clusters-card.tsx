import Link from 'next/link'

export function ErrorClustersCard({ items }: { items: { label: string; value: string; detail: string; href?: string }[] }) {
  return (
    <div className="rounded-3xl border border-red-400/15 bg-black/40 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Fehlercluster</h3>
        <span className="rounded-full border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-[11px] text-red-300">wo es wieder hakt</span>
      </div>
      <div className="space-y-3">
        {items.map((item) => {
          const card = (
            <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 transition ${item.href ? 'hover:border-white/20 hover:bg-white/[0.07]' : ''}`}>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">{item.label}</p>
              <p className="mt-2 text-base font-semibold text-white">{item.value}</p>
              <p className="mt-1 text-sm text-red-300">{item.detail}</p>
              {item.href ? <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/35">Verlusttrades öffnen</p> : null}
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
