export default function GlobalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="rounded-3xl border border-orange-400/15 bg-white/[0.04] px-6 py-5 shadow-2xl backdrop-blur-xl">
        <p className="text-[10px] uppercase tracking-[0.35em] text-white/38">Equora</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-orange-400">Lade Journal...</h1>
        <p className="mt-2 text-sm text-white/55">Marktstruktur wird sortiert, Kennzahlen werden geladen.</p>
      </div>
    </div>
  )
}
