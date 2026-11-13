import { journalText, type JournalLocale } from '@/lib/i18n/journal'

export function OkxCandidateStatus({ locale = 'de' }: { locale?: JournalLocale }) {
  const text = journalText(locale)
  return (
    <section aria-labelledby="okx-candidate-title" className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
      <div>
        <p className="eq-display text-[0.58rem] text-[#b09a7a]">OKX USDT Perpetuals</p>
        <h3 id="okx-candidate-title" className="mt-2 text-xl font-semibold text-white">{text("OKX-Verbindung noch nicht verfügbar", "OKX connection unavailable")}</h3>
        <p className="mt-3 text-sm leading-6 text-white/60">
          {text("Die Verbindung wird vorbereitet. Bisherige Prüfungen verwenden ausschließlich künstliche Daten; ein erfolgreicher Abruf bei OKX ist damit noch nicht belegt.", "This connection is in development. Checks have used test data only. A live OKX retrieval has yet to be verified.")}
        </p>
      </div>

      <div role="status" className="mt-5 rounded-2xl border border-[#e5a14d]/20 bg-[#e5a14d]/8 px-4 py-3 text-sm leading-6 text-[#efc98f]">
        {text("Es werden keine OKX-Zugangsdaten abgefragt, gespeichert oder übertragen. Verbindungen, Datenabrufe und die Übernahme ins Journal sind noch nicht freigeschaltet.", "OKX setup, data retrieval and journal import are unavailable. Equora does not request, store or send OKX credentials.")}
      </div>

      <dl className="mt-5 grid gap-3 text-xs">
        <GateRow label={text("Datenabruf", "Data retrieval")} value={text("Deaktiviert; bisher nur Tests mit künstlichen Daten", "Off. Test data only so far.")} />
        <GateRow label={text("Region und Konto", "Region and account")} value={text("Europäischer Anbieter und Demokonto noch nicht bestätigt", "European provider and demo account unconfirmed")} />
        <GateRow label={text("Nutzungsrecht", "Usage rights")} value={text("Kommerzieller Einsatz ohne schriftliche OKX-Freigabe blockiert", "Commercial use requires written approval from OKX")} />
        <GateRow label={text("Nächster Schritt", "Next step")} value={text("Gesonderte Sicherheitsprüfung und Freigabe erforderlich", "Separate security review and approval required")} />
      </dl>

      <p className="mt-5 text-xs leading-5 text-white/60">
        {text("Ein späterer Verbindungstest benötigt gesonderte Demo-Zugangsschlüssel mit Leserechten, geprüfte Sicherheitsvoraussetzungen und deine ausdrückliche Freigabe.", "A future connection test requires separate read-only demo credentials, verified security prerequisites and your approval.")}
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
