import { AppIcon } from '@/components/ui/app-icon'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { BrokerConnectionPanel } from '@/components/broker-sync/broker-connection-panel'
import type { BrokerSyncSnapshot } from '@/lib/server/broker-sync'
import type { BrokerCaptureRunSummary, BrokerPreviewItem } from '@/lib/types/broker-sync'

const workflow = [
  ['1', 'Leseschlüssel anlegen', 'Bei MEXC nur Futures-Leserechte aktivieren. Trading, Transfer und Auszahlung bleiben aus.'],
  ['2', 'Lesecapabilities prüfen', 'Equora prüft später nur fest benannte Leseabrufe; eine Testorder ist technisch nicht vorgesehen.'],
  ['3', 'Gefundene Daten ansehen', 'Orders und Ausführungen erscheinen zuerst als übersichtliche Vorschau.'],
  ['4', 'Später bewusst importieren', 'Erst in der nächsten Ausbaustufe entscheidest du, welche Trades ins Journal kommen.'],
] as const

export function BrokerSyncHub({ snapshot }: { snapshot: BrokerSyncSnapshot }) {
  const fullSnapshotAvailable = snapshot.readScope === 'full_snapshot'
  const userAttestedReadOnlyConnection = snapshot.connections.some((connection) =>
    connection.status === 'ready'
      && connection.readOnlyAttestation === 'user_confirmed',
  )
  const limitedTechnicalReadObserved = snapshot.connections.some((connection) =>
    connection.technicalReadResult === 'legacy_read_observed',
  )
  return (
    <div className="space-y-5 xl:space-y-6">
      <FuturisticCard glow="orange" className="p-6 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl border border-[#c8823a]/25 bg-[#c8823a]/10 p-3 text-[#f0a855]">
                <AppIcon name="sync" className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="eq-display text-[0.62rem] text-[#b09a7a]">Automatisch dokumentieren</p>
                <h2 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Broker verbinden</h2>
              </div>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/58 sm:text-base">
              Verwalte unterstützte Broker über eine gemeinsame Connectionübersicht. Providerfelder bleiben getrennt,
              und Equora zeigt gefundene Daten nur als begrenzte Vorschau. Es wird nichts gehandelt oder automatisch importiert.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label="v57.61.0" tone="gold" />
            <StatusPill
              label={snapshot.runtimeEnabled ? `Runtime ${snapshot.runtimeMode}` : 'Runtime aus'}
              tone={snapshot.runtimeEnabled ? 'quiet' : 'warning'}
            />
            {userAttestedReadOnlyConnection ? (
              <StatusPill label="Nutzer bestätigt: Read-only-Key" tone="quiet" />
            ) : null}
          </div>
        </div>
      </FuturisticCard>

      {snapshot.notice ? (
        <div className="rounded-2xl border border-[#c8823a]/20 bg-[#c8823a]/8 px-4 py-3 text-sm leading-6 text-[#dfc6a7]">
          {snapshot.notice}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <FuturisticCard className="p-6">
          <SectionHeading eyebrow="Sicherheitsgrenze" title="App-Funktionen und Providerrechte getrennt" />
          <div className="mt-5 grid gap-3">
            <PermissionCard
              title="Equora-Lesefunktion"
              description="Equora besitzt ausschließlich fest benannte GET-only-Lesepfade. Runtime und Nutzerfreigabe bleiben eigene Gates."
              state={limitedTechnicalReadObserved ? 'Begrenzter Leseabruf beobachtet' : 'Nicht technisch beobachtet'}
            />
            <PermissionCard
              title="Trading in Equora"
              description="Equora implementiert keine Funktion zum Öffnen, Ändern oder Schließen von Orders."
              state="In der App nicht implementiert"
            />
            <PermissionCard
              title="Provider-Schreibrechte"
              description="Eine Nutzerbestätigung ersetzt keine vollständige technische Rechteübersicht des Providers."
              state={userAttestedReadOnlyConnection
                ? 'Laut Nutzer deaktiviert; nicht vollständig verifiziert'
                : 'Nicht vollständig technisch verifiziert'}
            />
          </div>
          <p className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-sm leading-6 text-white/60">
            API-Schlüssel und Secret werden verschlüsselt in einem eigenen, serverseitigen Zugangsspeicher abgelegt.
            Nach dem Speichern werden sie nicht wieder an den Browser übertragen. Equora schreibt sie nicht bewusst in
            Client-Logs, URLs oder Browser-Storage; externe Provider- und Plattform-Logs sind durch dieses UI-Gate nicht vollständig auditiert.
          </p>
        </FuturisticCard>

        <FuturisticCard className="p-6">
          <SectionHeading eyebrow="Bereitschaft" title="Was schon funktioniert" />
          <div className="mt-5 space-y-3">
            <ReadinessRow label="Connectionübersicht" value={schemaStateLabel(snapshot.schemaState)} />
            <ReadinessRow
              label="Verschlüsselter Zugang"
              value={dependencyStateLabel(snapshot.secureStoreState)}
            />
            <ReadinessRow
              label="Serverseitiger Verbindungscheck"
              value={!snapshot.runtimeEnabled
                ? 'Runtime deaktiviert'
                : snapshot.connectorState === 'ready'
                  ? 'Voraussetzungen vorhanden; Start prüft erneut'
                  : snapshot.connectorState === 'not_read'
                    ? 'Status nicht lesbar; Setupformular nicht verfügbar'
                    : 'Runtime aktiv; Voraussetzungen fehlen'}
            />
            <ReadinessRow label="Automatisch ins Journal übernehmen" value="Noch ausgeschaltet" />
          </div>
        </FuturisticCard>
      </div>

      <FuturisticCard className="p-5 sm:p-6">
        <BrokerConnectionPanel
          connections={snapshot.connections}
          schemaState={snapshot.schemaState}
          connectorState={snapshot.connectorState}
          secureStoreState={snapshot.secureStoreState}
        />
      </FuturisticCard>

      <FuturisticCard className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading eyebrow="Datenvorschau" title="Zuletzt bei Brokern gefunden" />
          <span className="text-xs text-white/60">
            {fullSnapshotAvailable ? `${snapshot.preview.length} Einträge` : 'Detailevidenz nicht gelesen'}
          </span>
        </div>
        <div className="mt-5">
          {fullSnapshotAvailable && snapshot.preview.length ? (
            <div className="overflow-hidden rounded-2xl border border-white/8">
              <div className="hidden grid-cols-[0.7fr_1fr_1fr_0.8fr_0.8fr_1fr] gap-3 border-b border-white/8 bg-white/[0.025] px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-white/60 md:grid">
                <span>Art</span>
                <span>Markt</span>
                <span>Richtung</span>
                <span>Preis</span>
                <span>Ergebnis</span>
                <span>Zeit</span>
              </div>
              <div className="divide-y divide-white/6">
                {snapshot.preview.map((item) => <PreviewRow key={item.id} item={item} />)}
              </div>
            </div>
          ) : !fullSnapshotAvailable ? (
            <div className="rounded-2xl border border-dashed border-white/12 px-6 py-9 text-center">
              <p className="text-sm font-medium text-white">Detailevidenz ist über diesen Read-Pfad nicht verfügbar.</p>
              <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-white/60">
                Die Connectionübersicht umgeht keine geschlossenen Tabellenrechte. Fehlende Vorschauzeilen werden deshalb
                nicht als fehlende Brokerdaten interpretiert.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 px-6 py-9 text-center">
              <p className="text-sm font-medium text-white">Noch keine Datenvorschau vorhanden.</p>
              <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-white/60">
                Erst nach einem ausdrücklich freigegebenen Capturelauf erscheinen hier die zuletzt erfassten
                Brokerbeobachtungen. Der GET-only Verbindungsprobe speichert keine Rohdaten; Capture-Daten sind noch keine
                Journal-Trades.
              </p>
            </div>
          )}
        </div>
      </FuturisticCard>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <FuturisticCard className="p-6">
          <SectionHeading eyebrow="Ablauf" title="Vom Broker zur kontrollierten Vorschau" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {workflow.map(([number, title, description]) => (
              <div key={number} className="rounded-2xl border border-white/8 bg-white/[0.022] p-4">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#c8823a]/25 bg-[#c8823a]/10 text-xs font-semibold text-[#f0a855]">
                  {number}
                </span>
                <p className="mt-4 text-sm font-medium text-white">{title}</p>
                <p className="mt-2 text-xs leading-5 text-white/60">{description}</p>
              </div>
            ))}
          </div>
        </FuturisticCard>

        <FuturisticCard className="p-6">
          <SectionHeading eyebrow="Letzte Prüfungen" title="Was zuletzt passiert ist" />
          <div className="mt-5">
            {snapshot.recentRuns.length ? (
              <div className="space-y-3">
                {snapshot.recentRuns.map((run) => <RunCard key={run.id} run={run} />)}
              </div>
            ) : !fullSnapshotAvailable ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-sm leading-6 text-white/60">
                Captureläufe sind über diesen begrenzten Read-Pfad nicht sichtbar. Der Zustand bleibt deshalb unbekannt und wird nicht als leer ausgegeben.
              </div>
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-sm leading-6 text-white/60">
                In den verfügbaren Laufdaten wurde kein Capturelauf beobachtet. Nach einer eigenen Capturefreigabe erscheint hier, wie viele Datensätze
                beobachtet und wie viele bereits bekannt waren.
              </div>
            )}
          </div>
        </FuturisticCard>
      </div>
    </div>
  )
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="eq-display text-[0.58rem] text-[#b09a7a]">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
    </div>
  )
}

function StatusPill({ label, tone }: { label: string; tone: 'gold' | 'quiet' | 'warning' }) {
  const className = tone === 'gold'
    ? 'border-[#c8823a]/30 bg-[#c8823a]/10 text-[#f0a855]'
    : tone === 'warning'
      ? 'border-[#e5484d]/25 bg-[#e5484d]/10 text-[#ff9c9f]'
      : 'border-white/10 bg-white/[0.03] text-white/55'
  return <span className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] ${className}`}>{label}</span>
}

function PermissionCard({ title, description, state }: { title: string; description: string; state: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.022] p-4">
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm font-medium text-white">{title}</p>
        <span className="text-left text-[10px] uppercase tracking-[0.14em] text-white/60">{state}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/60">{description}</p>
    </div>
  )
}

function ReadinessRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
      <span className="text-sm text-white/55">{label}</span>
      <span className="text-xs font-medium text-white/82">{value}</span>
    </div>
  )
}

function schemaStateLabel(state: BrokerSyncSnapshot['schemaState']) {
  if (state === 'ready') return 'Lesbar'
  if (state === 'missing') return 'Schema nicht verfügbar'
  return 'Status nicht lesbar'
}

function dependencyStateLabel(state: BrokerSyncSnapshot['secureStoreState']) {
  if (state === 'ready') return 'Bereit'
  if (state === 'not_ready') return 'Nicht verfügbar'
  return 'Status nicht lesbar; Setupformular nicht verfügbar'
}

function PreviewRow({ item }: { item: BrokerPreviewItem }) {
  return (
    <div className="grid gap-3 px-4 py-4 text-xs md:grid-cols-[0.7fr_1fr_1fr_0.8fr_0.8fr_1fr] md:items-center">
      <span className="w-fit rounded-full border border-white/9 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/60">
        {item.kind === 'execution' ? 'Ausführung' : 'Order'}
      </span>
      <div>
        <span className="text-white/60 md:hidden">Markt · </span>
        <span className="font-medium text-white/78">{item.symbol}</span>
      </div>
      <div>
        <span className="text-white/60 md:hidden">Richtung · </span>
        <span className="text-white/58">{item.direction}</span>
      </div>
      <div>
        <span className="text-white/60 md:hidden">Preis · </span>
        <span className="text-white/58">{formatNumber(item.price)}</span>
      </div>
      <div>
        <span className="text-white/60 md:hidden">Ergebnis · </span>
        <span className="text-white/58">{formatSignedNumber(item.profit)}</span>
      </div>
      <div>
        <span className="text-white/60 md:hidden">Zeit · </span>
        <span className="text-white/60">{formatDate(item.occurredAt)}</span>
      </div>
    </div>
  )
}

function RunCard({ run }: { run: BrokerCaptureRunSummary }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white">{runStatus(run.status)}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/60">{formatDate(run.created_at)}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/60">
        Beobachtet {run.observed_event_count} · neu gespeichert {run.inserted_raw_event_count}
        {' '}· wiederholt {run.repeated_observation_count} · Fehler {run.failed_request_count}
      </p>
    </div>
  )
}

function runStatus(status: string) {
  const labels: Record<string, string> = {
    pending: 'Wartet',
    running: 'Wird geprüft',
    completed: 'Erfassung abgeschlossen',
    partial: 'Teilweise gespeichert',
    failed: 'Prüfung fehlgeschlagen',
    cancelled: 'Abgebrochen',
  }
  return labels[status] ?? 'Prüfung'
}

function formatNumber(value: number | null) {
  if (value == null) return 'Offen'
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 8 }).format(value)
}

function formatSignedNumber(value: number | null) {
  if (value == null) return 'Offen'
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 8, signDisplay: 'exceptZero' }).format(value)
}

function formatDate(value?: string | null) {
  if (!value) return 'Ohne Datum'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Ohne Datum'
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}
