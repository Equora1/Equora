import { FuturisticCard } from '@/components/ui/futuristic-card'

export function DataOwnershipCard({ source }: { source: 'supabase' | 'mock' }) {
  const supabaseLabel = source === 'supabase' ? 'Live verbunden' : 'Projekt angelegt'
  const modeLabel = source === 'supabase' ? 'Persönlicher Modus' : 'Demo mit Beispieldaten'

  return (
    <FuturisticCard className="p-5">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
          <p className="text-[10px] uppercase tracking-[0.35em] text-white/38">Daten &amp; Sicherheit</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-orange-300">Deine Trades bleiben in deinem Bereich</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
            Dein Journal gehört zu deinem Nutzerkonto. Gemeinsame Vorlagen und bewusst geteilte Inhalte werden gesondert angezeigt.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Sicherheitsmodus</p>
          <p className="mt-3 text-2xl font-semibold text-emerald-200">{modeLabel}</p>
          <p className="mt-2 text-sm leading-6 text-white/50">Zugriffsregeln trennen persönliche Journaldaten. In der Demo werden Beispieldaten angezeigt.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{supabaseLabel}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Zugriff auf deine eigenen Daten</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">Persönliches Journal</span>
          </div>
        </div>
      </div>
    </FuturisticCard>
  )
}
