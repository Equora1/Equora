'use client'

export default function TradesError({ reset }: { reset: () => void }) {
  return (
    <div className="rounded-[28px] border border-red-400/15 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
      <p className="text-[10px] uppercase tracking-[0.35em] text-white/38">Trades</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-red-300">Trades konnten nicht geladen werden</h2>
      <p className="mt-3 text-sm leading-6 text-white/58">
        Die Trade-Ansicht ist gerade nicht ganz sauber ausgerichtet. Ein Neustart der Ansicht hilft meist.
      </p>
      <button
        onClick={reset}
        className="mt-5 rounded-2xl border border-orange-400/30 bg-orange-400 px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01]"
      >
        Ansicht neu laden
      </button>
    </div>
  )
}
