export function OkxCandidateStatus() {
  return (
    <section aria-labelledby="okx-candidate-title" className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
      <div>
        <p className="eq-display text-[0.58rem] text-[#b09a7a]">OKX USDT Perpetuals</p>
        <h3 id="okx-candidate-title" className="mt-2 text-xl font-semibold text-white">Lokaler Kandidat – Verbindung gesperrt</h3>
        <p className="mt-3 text-sm leading-6 text-white/60">
          Adapter, Vertragsorakel und eine netzwerkfreie Synthetikruntime sind lokal angebunden. Das ist noch kein
          unterstützter oder verfügbarer OKX-Provider und kein erfolgreicher Broker-Probe.
        </p>
      </div>

      <div role="status" className="mt-5 rounded-2xl border border-[#e5a14d]/20 bg-[#e5a14d]/8 px-4 py-3 text-sm leading-6 text-[#efc98f]">
        Es werden keine OKX-Zugangsdaten abgefragt, gespeichert oder übertragen. Reale API-Aufrufe, Connection-Apply,
        Capture und Journalimport sind technisch und organisatorisch gesperrt.
      </div>

      <dl className="mt-5 grid gap-3 text-xs">
        <GateRow label="Runtime" value="Production aus; nur lokaler Synthetiktest" />
        <GateRow label="Region und Konto" value="EEA-Entity und Demokonto noch nicht attestiert" />
        <GateRow label="Nutzungsrecht" value="Kommerzieller Einsatz ohne schriftliche OKX-Freigabe blockiert" />
        <GateRow label="Nächster externer Schritt" value="Eigener Freigabe- und Security-Review erforderlich" />
      </dl>

      <p className="mt-5 text-xs leading-5 text-white/60">
        Ein späterer Probe benötigt separat erzeugte Read-only-Demo-Credentials mit exakt gebundener Egress-IP,
        MFA- und Incident-Attestierung, Single-use-Permits sowie eine neue konkrete Nutzerfreigabe.
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
