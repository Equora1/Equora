'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-xl rounded-3xl border border-red-400/15 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
        <p className="text-[10px] uppercase tracking-[0.35em] text-white/38">Equora</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-red-300">Da ist etwas aus dem Takt geraten</h1>
        <p className="mt-3 text-sm leading-6 text-white/58">
          Die aktuelle Ansicht konnte nicht sauber geladen werden. Das ist meist nur ein kleiner Routing-
          oder Datenfluss-Huster.
        </p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
          {error.message || 'Unbekannter Fehler'}
        </div>
        <button
          onClick={reset}
          className="mt-5 rounded-2xl border border-orange-400/30 bg-orange-400 px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01]"
        >
          Ansicht neu laden
        </button>
      </div>
    </div>
  )
}
