export function OkxCandidateStatus() {
  return (
    <section aria-labelledby="okx-candidate-title" className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
      <div>
        <p className="eq-display text-[0.58rem] text-[#b09a7a]">OKX USDT Perpetuals</p>
        <h3 id="okx-candidate-title" className="mt-2 text-xl font-semibold text-white">OKX-Verbindung noch nicht verfügbar</h3>
        <p className="mt-3 text-sm leading-6 text-white/60">
          Die Verbindung wird vorbereitet. Bisherige Prüfungen verwenden ausschließlich künstliche Daten;
          ein erfolgreicher Abruf bei OKX ist damit noch nicht belegt.
        </p>
      </div>

      <div role="status" className="mt-5 rounded-2xl border border-[#e5a14d]/20 bg-[#e5a14d]/8 px-4 py-3 text-sm leading-6 text-[#efc98f]">
        Es werden keine OKX-Zugangsdaten abgefragt, gespeichert oder übertragen.
        Verbindungen, Datenabrufe und die Übernahme ins Journal sind noch nicht freigeschaltet.
      </div>

      <dl className="mt-5 grid gap-3 text-xs">
        <GateRow label="Datenabruf" value="Deaktiviert; bisher nur Tests mit künstlichen Daten" />
        <GateRow label="Region und Konto" value="Europäischer Anbieter und Demokonto noch nicht bestätigt" />
        <GateRow label="Nutzungsrecht" value="Kommerzieller Einsatz ohne schriftliche OKX-Freigabe blockiert" />
        <GateRow label="Nächster Schritt" value="Gesonderte Sicherheitsprüfung und Freigabe erforderlich" />
      </dl>

      <p className="mt-5 text-xs leading-5 text-white/60">
        Ein späterer Verbindungstest benötigt gesonderte Demo-Zugangsschlüssel mit Leserechten,
        geprüfte Sicherheitsvoraussetzungen und deine ausdrückliche Freigabe.
      </p>
    </section>
  )
}

function GateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
      <dt className="text-white/60">{label}</dt>
      <dd className="max-w-[64%] text-right text-white/68">{value}</dd>
    </div>
  )
}
