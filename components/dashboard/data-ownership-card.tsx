import { FuturisticCard } from '@/components/ui/futuristic-card'

export function DataOwnershipCard({ source }: { source: 'supabase' | 'mock' }) {
  const supabaseLabel = source === 'supabase' ? 'Live verbunden' : 'Projekt angelegt'
  const modeLabel = source === 'supabase' ? 'Persönlicher Modus' : 'Demo mit Live-Pfad'

  return (
    <FuturisticCard className="p-5">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
          <p className="text-[10px] uppercase tracking-[0.35em] text-white/38">Daten &amp; Sicherheit</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-orange-300">Deine Trades bleiben in deinem Bereich</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
            Eigene Daten, klare Trennung, RLS im Hintergrund. Diese Fläche sagt nur, warum du der Datenbasis trauen kannst.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Sicherheitsmodus</p>
          <p className="mt-3 text-2xl font-semibold text-emerald-200">{modeLabel}</p>
          <p className="mt-2 text-sm leading-6 text-white/50">Supabase, RLS und Kontotrennung arbeiten im Hintergrund, damit du nicht bei jedem Schritt darüber nachdenken musst.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{supabaseLabel}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Nur eigener User-Scope</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Policies im Schema</span>
          </div>
        </div>
      </div>
    </FuturisticCard>
  )
}
