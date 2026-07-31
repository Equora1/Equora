import Link from 'next/link'
import type { SetupRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'

export function SetupsKickstartCard({ setups, trades }: { setups: SetupRow[]; trades: Trade[] }) {
  const personalSetupCount = setups.filter((setup) => Boolean(setup.created_at)).length
  if (personalSetupCount > 0 && trades.length > 0) return null

  return (
    <section className="rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-orange-200/70">Setup Kickstart</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Ein kleines Setup-Vokabular spart später große Analyse-Verwirrung</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
            Die Starter-Library ist schon da. Für den echten Nutzerpfad reichen aber schon ein oder zwei persönliche Setup-Namen, damit Schnellerfassung,
            Filter und Reviews dieselbe Sprache sprechen.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/65">
          {personalSetupCount > 0 ? `${personalSetupCount} persönliche Setups erkannt` : 'Noch keine persönlichen Setups im Konto'}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/trades"
          className="inline-flex items-center rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition hover:border-orange-400/40 hover:bg-orange-400/14"
        >
          Danach direkt in die Schnellerfassung
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white"
        >
          Onboarding im Dashboard sehen
        </Link>
      </div>
    </section>
  )
}
