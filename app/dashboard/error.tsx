'use client'

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div className="rounded-[28px] border border-red-400/15 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
      <p className="text-[10px] uppercase tracking-[0.35em] text-white/38">Dashboard</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-red-300">Dashboard konnte nicht geladen werden</h2>
      <p className="mt-3 text-sm leading-6 text-white/58">
        Die Kennzahlen oder die letzten Trades sind gerade aus dem Raster gefallen.
      </p>
      <button
        onClick={reset}
        className="mt-5 rounded-2xl border border-orange-400/30 bg-orange-400 px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01]"
      >
        Nochmal versuchen
      </button>
    </div>
  )
}
