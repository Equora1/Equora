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
          <p className="text-[10px] uppercase tracking-[0.28em] text-amber-200/75">Einrichtungsstatus</p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {status.mode === 'demo' ? 'Du siehst die Demo' : 'Einige Funktionen sind noch nicht eingerichtet'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            {status.mode === 'demo'
              ? 'Diese Umgebung verwendet Beispieldaten. Für ein persönliches Journal muss die Kontoverbindung eingerichtet werden.'
              : 'Die Servereinrichtung ist noch unvollständig. Bitte wende dich an die Administration, wenn eine Funktion nicht verfügbar ist.'}
          </p>
        </div>
        <details className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-amber-100/85">
          <summary className="cursor-pointer">Technische Hinweise für die Administration</summary>
          <p className="mt-2 break-words">Fehlende Einstellungen: {list.join(', ')}</p>
        </details>
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
