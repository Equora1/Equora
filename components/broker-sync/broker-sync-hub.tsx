import { AppIcon } from '@/components/ui/app-icon'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { MexcConnectionPanel } from '@/components/broker-sync/mexc-connection-panel'
import type { BrokerSyncSnapshot } from '@/lib/server/broker-sync'
import type { BrokerPreviewItem } from '@/lib/types/broker-sync'
import type { BrokerSyncRunRow } from '@/lib/types/db'

const workflow = [
  ['1', 'Leseschlüssel anlegen', 'Bei MEXC nur Futures-Leserechte aktivieren. Trading, Transfer und Auszahlung bleiben aus.'],
  ['2', 'Lesecapabilities prüfen', 'Equora prüft später nur fest benannte Leseabrufe; eine Testorder ist technisch nicht vorgesehen.'],
  ['3', 'Gefundene Daten ansehen', 'Orders und Ausführungen erscheinen zuerst als übersichtliche Vorschau.'],
  ['4', 'Später bewusst importieren', 'Erst in der nächsten Ausbaustufe entscheidest du, welche Trades ins Journal kommen.'],
] as const

export function BrokerSyncHub({ snapshot }: { snapshot: BrokerSyncSnapshot }) {
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
              Verbinde MEXC mit einem Schlüssel, der ausschließlich lesen darf. Equora zeigt dir zuerst, welche Orders
              und Ausführungen gefunden wurden. Es wird nichts gehandelt und noch nichts automatisch importiert.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill label="v57.60.1" tone="gold" />
            <StatusPill
              label={snapshot.connectorReady ? 'MEXC bereit' : snapshot.runtimeGate === 'g1_transport_only' ? 'G1 gesperrt' : 'Einrichtung nötig'}
              tone={snapshot.connectorReady ? 'quiet' : 'warning'}
            />
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
          <SectionHeading eyebrow="Sicherheitsgrenze" title="Equora darf lesen, sonst nichts" />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <PermissionCard title="Daten lesen" description="Orders, Ausführungen, Gebühren und Ergebnisse abrufen." state="Bis G1 gesperrt" />
            <PermissionCard title="Trades ausführen" description="Keine Order öffnen, ändern oder schließen." state="Nicht vorhanden" />
            <PermissionCard title="Geld bewegen" description="Keine Auszahlung und kein interner Transfer." state="Nicht vorhanden" />
          </div>
          <p className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-sm leading-6 text-white/48">
            API-Schlüssel und Secret werden verschlüsselt in einem eigenen, serverseitigen Zugangsspeicher abgelegt.
            Nach dem Speichern werden sie nicht wieder an den Browser übertragen und erscheinen nicht in Protokollen.
          </p>
        </FuturisticCard>

        <FuturisticCard className="p-6">
          <SectionHeading eyebrow="Bereitschaft" title="Was schon funktioniert" />
          <div className="mt-5 space-y-3">
            <ReadinessRow label="Broker-Bereich" value={snapshot.schemaReady ? 'Bereit' : 'Grundlage fehlt'} />
            <ReadinessRow label="Verschlüsselter Zugang" value={snapshot.secureStoreReady ? 'Bereit' : 'Patches v57.60 + v57.60.1 nötig'} />
            <ReadinessRow label="MEXC-Verbindung prüfen" value={snapshot.connectorReady ? 'Bereit' : snapshot.runtimeGate === 'g1_transport_only' ? 'Bis G1 gesperrt' : 'Vercel prüfen'} />
            <ReadinessRow label="Automatisch ins Journal übernehmen" value="Noch ausgeschaltet" />
          </div>
        </FuturisticCard>
      </div>

      <FuturisticCard className="p-5 sm:p-6">
        <MexcConnectionPanel
          connections={snapshot.connections}
          connectorReady={snapshot.connectorReady}
          secureStoreReady={snapshot.secureStoreReady}
        />
      </FuturisticCard>

      <FuturisticCard className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading eyebrow="Datenvorschau" title="Zuletzt bei MEXC gefunden" />
          <span className="text-xs text-white/35">{snapshot.preview.length} Einträge</span>
        </div>
        <div className="mt-5">
          {snapshot.preview.length ? (
            <div className="overflow-hidden rounded-2xl border border-white/8">
              <div className="hidden grid-cols-[0.7fr_1fr_1fr_0.8fr_0.8fr_1fr] gap-3 border-b border-white/8 bg-white/[0.025] px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-white/35 md:grid">
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
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 px-6 py-9 text-center">
              <p className="text-sm font-medium text-white">Noch keine Datenvorschau vorhanden.</p>
              <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-white/40">
                Sobald eine MEXC-Verbindung erfolgreich geprüft wurde, erscheinen hier die zuletzt gefundenen Orders und
                Ausführungen. Sie sind noch keine Journal-Trades.
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
                <p className="mt-2 text-xs leading-5 text-white/42">{description}</p>
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
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-sm leading-6 text-white/42">
                Noch keine Verbindung geprüft. Hier erscheint später, wie viele Datensätze gefunden und wie viele bereits
                bekannt waren.
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

function PermissionCard({ title, description, state }: { title: string; description: string; state: 'Bis G1 gesperrt' | 'Nicht vorhanden' }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.022] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white">{title}</p>
        <span className={`text-[10px] uppercase tracking-[0.14em] ${state === 'Bis G1 gesperrt' ? 'text-[#f0a855]' : 'text-white/35'}`}>{state}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/42">{description}</p>
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

function PreviewRow({ item }: { item: BrokerPreviewItem }) {
  return (
    <div className="grid gap-3 px-4 py-4 text-xs md:grid-cols-[0.7fr_1fr_1fr_0.8fr_0.8fr_1fr] md:items-center">
      <span className="w-fit rounded-full border border-white/9 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/48">
        {item.kind === 'execution' ? 'Ausführung' : 'Order'}
      </span>
      <div>
        <span className="text-white/35 md:hidden">Markt · </span>
        <span className="font-medium text-white/78">{item.symbol}</span>
      </div>
      <div>
        <span className="text-white/35 md:hidden">Richtung · </span>
        <span className="text-white/58">{item.direction}</span>
      </div>
      <div>
        <span className="text-white/35 md:hidden">Preis · </span>
        <span className="text-white/58">{formatNumber(item.price)}</span>
      </div>
      <div>
        <span className="text-white/35 md:hidden">Ergebnis · </span>
        <span className="text-white/58">{formatSignedNumber(item.profit)}</span>
      </div>
      <div>
        <span className="text-white/35 md:hidden">Zeit · </span>
        <span className="text-white/45">{formatDate(item.occurredAt)}</span>
      </div>
    </div>
  )
}

function RunCard({ run }: { run: BrokerSyncRunRow }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white">{runStatus(run.status)}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">{formatDate(run.created_at)}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/42">
        Gefunden {run.fetched_count ?? 0} · bereits bekannt {run.duplicate_count ?? 0} · noch nicht importiert
      </p>
    </div>
  )
}

function runStatus(status: string) {
  const labels: Record<string, string> = {
    pending: 'Wartet',
    running: 'Wird geprüft',
    completed: 'Legacy-Vorschau abgeschlossen',
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
