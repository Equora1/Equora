'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  refreshMexcPreview,
  removeBrokerConnection,
} from '@/app/actions/broker-sync'
import { MexcConnectionSetup } from '@/components/broker-sync/providers/mexc-connection-setup'
import type { BrokerDependencyState } from '@/lib/server/broker-sync'
import {
  BROKER_PROVIDER_PRESENTATIONS,
  canShowBrokerConnectionActions,
  findBrokerProviderPresentation,
  type BrokerConnectionSummary,
  type BrokerProviderUiCode,
} from '@/lib/types/broker-sync'

type Feedback = Readonly<{
  tone: 'success' | 'error'
  message: string
}> | null

export function BrokerConnectionPanel({
  connections,
  connectorState,
  secureStoreState,
}: {
  connections: readonly BrokerConnectionSummary[]
  connectorState: BrokerDependencyState
  secureStoreState: BrokerDependencyState
}) {
  const router = useRouter()
  const [selectedProviderCode, setSelectedProviderCode] = useState<BrokerProviderUiCode>('mexc')
  const [isPending, startTransition] = useTransition()
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const selectedProvider = findBrokerProviderPresentation(selectedProviderCode)

  function refreshConnection(connectionId: string) {
    setFeedback(null)
    setActiveConnectionId(connectionId)
    startTransition(async () => {
      const result = await refreshMexcPreview(connectionId)
      setFeedback({ tone: result.success ? 'success' : 'error', message: result.message })
      setActiveConnectionId(null)
      router.refresh()
    })
  }

  function removeConnection(connectionId: string, title: string) {
    const confirmed = window.confirm(
      `Verbindung „${title}“ wirklich widerrufen? Der Brokerzugriff wird dauerhaft gesperrt; historische Rohdaten bleiben erhalten.`,
    )
    if (!confirmed) return

    setFeedback(null)
    setActiveConnectionId(connectionId)
    startTransition(async () => {
      const result = await removeBrokerConnection(connectionId)
      setFeedback({ tone: result.success ? 'success' : 'error', message: result.message })
      setActiveConnectionId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="provider-overview-title" className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eq-display text-[0.58rem] text-[#b09a7a]">Providerübersicht</p>
            <h3 id="provider-overview-title" className="mt-2 text-xl font-semibold text-white">Unterstützten Anbieter wählen</h3>
          </div>
          <span className="text-xs text-white/60">{BROKER_PROVIDER_PRESENTATIONS.length} integrierter Anbieter</span>
        </div>

        <div role="list" className="mt-5 grid gap-3 md:grid-cols-2">
          {BROKER_PROVIDER_PRESENTATIONS.map((provider) => {
            const selected = provider.providerCode === selectedProviderCode
            return (
              <div key={provider.providerCode} role="listitem">
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-controls="provider-setup-panel"
                  onClick={() => setSelectedProviderCode(provider.providerCode)}
                  className={`w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60 ${
                    selected
                      ? 'border-[#c8823a]/40 bg-[#c8823a]/10'
                      : 'border-white/8 bg-black/20 hover:border-white/16'
                  }`}
                >
                  <span className="flex items-start justify-between gap-4">
                    <span>
                      <span className="block text-sm font-medium text-white">{provider.displayName}</span>
                      <span className="mt-1 block text-xs text-white/60">{provider.marketLabel}</span>
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/55">
                      {selected ? 'Ausgewählt' : 'Verfügbar'}
                    </span>
                  </span>
                  <span className="mt-3 block text-xs leading-5 text-white/60">{provider.readBoundary}</span>
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <div id="provider-setup-panel" className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        {selectedProvider?.setupComponent === 'mexc_readonly_setup_v1' ? (
          <MexcConnectionSetup connectorState={connectorState} secureStoreState={secureStoreState} />
        ) : (
          <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
            <h3 className="text-xl font-semibold text-white">Kein Setup verfügbar</h3>
            <p className="mt-3 text-sm leading-6 text-white/60">
              Für einen unbekannten Provider existiert keine gebaute Setup-Komponente. Es werden keine Credentials
              angefordert und keine Brokeraktion ausgeführt.
            </p>
          </section>
        )}

        <section aria-labelledby="connection-overview-title" className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eq-display text-[0.58rem] text-[#b09a7a]">Connectionübersicht</p>
              <h3 id="connection-overview-title" className="mt-2 text-xl font-semibold text-white">Gespeicherte Verbindungen</h3>
            </div>
            <span className="text-xs text-white/60">{connections.length}</span>
          </div>

          <div className="mt-5 space-y-3">
            {connections.length ? connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                isPending={isPending}
                isActive={isPending && activeConnectionId === connection.id}
                onRefresh={refreshConnection}
                onRemove={removeConnection}
              />
            )) : (
              <div className="rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center">
                <p className="text-sm font-medium text-white">Noch kein Broker verbunden.</p>
                <p className="mt-2 text-xs leading-5 text-white/60">
                  Wähle einen gebauten Provider und nutze ausschließlich dessen getrennte Setupfelder.
                </p>
              </div>
            )}
          </div>

          {feedback ? (
            <div
              role={feedback.tone === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${
                feedback.tone === 'success'
                  ? 'border-emerald-300/18 bg-emerald-400/7 text-emerald-100/80'
                  : 'border-red-300/18 bg-red-400/7 text-red-100/80'
              }`}
            >
              {feedback.message}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

function ConnectionCard({
  connection,
  isPending,
  isActive,
  onRefresh,
  onRemove,
}: {
  connection: BrokerConnectionSummary
  isPending: boolean
  isActive: boolean
  onRefresh: (connectionId: string) => void
  onRemove: (connectionId: string, title: string) => void
}) {
  const provider = findBrokerProviderPresentation(connection.providerCode)
  const title = connection.accountLabel || provider?.displayName || 'Unbekannte Verbindung'
  const providerLabel = provider ? `${provider.displayName} ${provider.marketLabel}` : 'Nicht unterstützter Provider'

  return (
    <article className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-1 text-xs text-white/60">{providerLabel} · {environmentLabel(connection.environment)}</p>
        </div>
        <ConnectionStatus status={connection.status} />
      </div>

      <dl className="mt-4 grid gap-2 text-xs">
        <ConnectionDetail label="Technischer Leseerfolg" value={technicalReadLabel(connection.technicalReadResult)} />
        <ConnectionDetail label="Read-only-Attestierung" value={attestationLabel(connection.readOnlyAttestation)} />
        <ConnectionDetail label="Permission-Evidenz" value={permissionEvidenceLabel(connection.permissionEvidence)} />
        <ConnectionDetail label="Kontoidentität" value={identityLabel(connection.accountIdentityResult)} />
        <ConnectionDetail label="Historische Coverage" value={coverageLabel(connection.historyCoverage)} />
        <ConnectionDetail
          label="Letzter qualifizierter Capturelauf"
          value={formatCaptureDate(connection.lastCaptureAt, connection.historyCoverage)}
        />
      </dl>

      {connection.hasSanitizedError ? (
        <p className="mt-3 rounded-xl border border-red-300/15 bg-red-400/6 px-3 py-2 text-xs leading-5 text-red-100/70">
          Die letzte serverseitige Prüfung meldete einen Fehler. Rohe Providertexte und Payloadwerte werden hier nicht angezeigt.
        </p>
      ) : null}

      {provider?.providerCode === 'mexc' && canShowBrokerConnectionActions(connection) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => onRefresh(connection.id)}
            className="rounded-full border border-[#c8823a]/25 bg-[#c8823a]/10 px-3 py-1.5 text-xs text-[#f3bd7f] transition hover:bg-[#c8823a]/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60 disabled:opacity-45"
          >
            {isActive ? 'Ansicht wird aktualisiert …' : 'Ansicht aktualisieren'}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onRemove(connection.id, title)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60 transition hover:text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-45"
          >
            Verbindung widerrufen
          </button>
        </div>
      ) : null}
    </article>
  )
}

function ConnectionStatus({ status }: { status: BrokerConnectionSummary['status'] }) {
  const labels: Record<BrokerConnectionSummary['status'], string> = {
    ready: 'Verbindung angelegt',
    draft: 'Setup offen',
    paused: 'Pausiert',
    error: 'Prüfung nötig',
    revoked: 'Widerrufen',
    unknown: 'Unbekannter Status',
  }
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/52">
      {labels[status]}
    </span>
  )
}

function ConnectionDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-white/60">{label}</dt>
      <dd className="max-w-[62%] text-right text-white/62">{value}</dd>
    </div>
  )
}

function technicalReadLabel(value: BrokerConnectionSummary['technicalReadResult']) {
  return value === 'legacy_read_observed'
    ? 'Begrenzter Legacy-Leseabruf beobachtet'
    : 'Probe-Ergebnis nicht dauerhaft gespeichert'
}

function attestationLabel(value: BrokerConnectionSummary['readOnlyAttestation']) {
  return value === 'user_confirmed' ? 'Vom Nutzer bestätigt' : 'Nicht bestätigt'
}

function permissionEvidenceLabel(value: BrokerConnectionSummary['permissionEvidence']) {
  return value === 'limited_read_observed'
    ? 'Begrenzte Leseevidenz; keine Gesamtrechteprüfung'
    : 'Keine dauerhafte technische Rechteübersicht'
}

function identityLabel(value: BrokerConnectionSummary['accountIdentityResult']) {
  return value === 'pseudonymous_binding_present'
    ? 'Pseudonym serverseitig gebunden'
    : 'Keine serverseitige Kontobindung sichtbar'
}

function coverageLabel(value: BrokerConnectionSummary['historyCoverage']) {
  if (value === 'capture_observed') return 'Capture-Daten beobachtet; keine Vollhistorie belegt'
  if (value === 'unavailable') return 'Capture-Evidenz derzeit nicht verfügbar'
  return 'In verfügbaren Laufdaten nicht beobachtet'
}

function environmentLabel(value: BrokerConnectionSummary['environment']) {
  if (value === 'live') return 'Live-Konto'
  if (value === 'demo') return 'Demo-Konto'
  return 'Umgebung unbekannt'
}

function formatCaptureDate(
  value: string | null,
  coverage: BrokerConnectionSummary['historyCoverage'],
) {
  if (coverage === 'unavailable') return 'Derzeit nicht verfügbar'
  if (!value) return 'Kein qualifizierter Lauf beobachtet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Evidenzzeitpunkt ungültig'
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}
