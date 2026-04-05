import { getSupabaseRuntimeStatus } from '@/lib/supabase/config'

export function RuntimeStatusCard() {
  const status = getSupabaseRuntimeStatus()

  if (status.mode === 'supabase' && status.missingServerEnv.length === 0) {
    return null
  }

  const list = status.mode === 'demo' ? status.missingClientEnv : status.missingServerEnv

  return (
    <section className="rounded-[28px] border border-amber-400/20 bg-amber-400/[0.07] p-5 shadow-xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[10px] uppercase tracking-[0.28em] text-amber-200/75">Runtime-Status</p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {status.mode === 'demo' ? 'Deploy-Konfiguration unvollständig' : 'Server-Erweiterung noch nicht komplett'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            {status.mode === 'demo'
              ? 'Equora läuft gerade fehlertolerant im Demo-Modus. Login, Sync und Storage bleiben bewusst weich, bis die fehlenden Env-Werte gesetzt sind.'
              : 'Die App läuft, aber serverseitige Admin- und Service-Role-Wege bleiben eingeschränkt, bis alle Env-Werte vorhanden sind.'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-amber-100/85">
          Fehlende Werte: {list.join(', ')}
        </div>
      </div>
      {status.warnings.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {status.warnings.map((warning) => (
            <span key={warning} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-white/70">
              {warning}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}
