'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { journalNumberLocale, journalText, type JournalLocale } from '@/lib/i18n/journal'
import { DEFAULT_TRADE_TIMEZONE } from '@/lib/utils/trade-time'
import {
  refreshMexcPreview,
  removeBrokerConnection,
} from '@/app/actions/broker-sync'
import { MexcConnectionSetup } from '@/components/broker-sync/providers/mexc-connection-setup'
import { OkxCandidateStatus } from '@/components/broker-sync/providers/okx-candidate-status'
import type { BrokerDependencyState, BrokerSchemaState } from '@/lib/server/broker-sync'
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
  locale = 'de',
  connections,
  schemaState,
  connectorState,
  secureStoreState,
}: {
  locale?: JournalLocale
  connections: readonly BrokerConnectionSummary[]
  schemaState: BrokerSchemaState
  connectorState: BrokerDependencyState
  secureStoreState: BrokerDependencyState
}) {
  const text = journalText(locale)
  const router = useRouter()
  const [selectedProviderCode, setSelectedProviderCode] = useState<BrokerProviderUiCode>('mexc')
  const [isPending, startTransition] = useTransition()
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const selectedProvider = findBrokerProviderPresentation(selectedProviderCode)
  const connectionListReadable = schemaState === 'ready'
  const builtInProviderCount = BROKER_PROVIDER_PRESENTATIONS.filter((provider) => provider.availability === 'built_in').length
  const candidateProviderCount = BROKER_PROVIDER_PRESENTATIONS.length - builtInProviderCount

  function refreshConnection(connectionId: string) {
    setFeedback(null)
    setActiveConnectionId(connectionId)
    startTransition(async () => {
      const result = await refreshMexcPreview(connectionId, locale)
      setFeedback({ tone: result.success ? 'success' : 'error', message: result.message })
      setActiveConnectionId(null)
      router.refresh()
    })
  }

  function removeConnection(connectionId: string, title: string) {
    const confirmed = window.confirm(
      text(`Verbindung „${title}“ widerrufen? Der Brokerzugriff wird dauerhaft gesperrt. Historische Rohdaten bleiben erhalten.`, `Revoke “${title}”? Broker access will be permanently blocked. Historical data will be kept.`),
    )
    if (!confirmed) return

    setFeedback(null)
    setActiveConnectionId(connectionId)
    startTransition(async () => {
      const result = await removeBrokerConnection(connectionId, locale)
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
            <p className="eq-display text-[0.58rem] text-[#b09a7a]">{text("Providerübersicht", "Broker providers")}</p>
            <h3 id="provider-overview-title" className="mt-2 text-xl font-semibold text-white">{text("Anbieterstatus wählen", "Choose a broker")}</h3>
          </div>
          <span className="text-xs text-white/60">{text(`${builtInProviderCount} integriert · ${candidateProviderCount} in Vorbereitung`, `${builtInProviderCount} built in · ${candidateProviderCount} in development`)}</span>
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
                      {provider.availability === 'local_candidate_locked'
                        ? text("Kandidat · gesperrt", "In development")
                        : selected
                          ? text("Ausgewählt", "Selected")
                          : text("Verfügbar", "Available")}
                    </span>
                  </span>
                  <span className="mt-3 block text-xs leading-5 text-white/60">{provider.providerCode === 'mexc'
                    ? text('Die Verbindung kann ausgewählte Daten lesen. Handel, Transfers und automatischer Import sind ausgeschlossen.', 'The connection can read selected data. Trading, transfers and automatic import are unavailable.')
                    : text('Direkter Abruf noch nicht verfügbar. Bisher nur mit Testdaten geprüft.', 'Direct access is unavailable. Checks have used test data only.')}</span>
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <div id="provider-setup-panel" className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        {selectedProvider?.setupComponent === 'mexc_readonly_setup_v1' ? (
          <MexcConnectionSetup connectorState={connectorState} secureStoreState={secureStoreState} locale={locale} />
        ) : selectedProvider?.setupComponent === 'okx_candidate_status_v1' ? (
          <OkxCandidateStatus locale={locale} />
        ) : (
          <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
            <h3 className="text-xl font-semibold text-white">{text("Kein Setup verfügbar", "Setup unavailable")}</h3>
            <p className="mt-3 text-sm leading-6 text-white/60">
              {text("Für diesen Broker ist keine Verbindung verfügbar. Es werden keine Zugangsdaten abgefragt und keine Brokeraktionen ausgeführt.", "This broker cannot be connected yet.")}
            </p>
          </section>
        )}

        <section aria-labelledby="connection-overview-title" className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eq-display text-[0.58rem] text-[#b09a7a]">{text("Verbindungsübersicht", "Connections")}</p>
              <h3 id="connection-overview-title" className="mt-2 text-xl font-semibold text-white">{text("Gelesene Verbindungen", "Saved connections")}</h3>
            </div>
            <span className="text-xs text-white/60">
              {connectionListReadable
                ? text(`${connections.length} geladen`, `${connections.length} loaded`)
                : schemaState === 'missing'
                  ? text("Einrichtung nicht verfügbar", "Setup unavailable")
                  : text("Status nicht lesbar", "Status unavailable")}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {connectionListReadable && connections.length ? connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                locale={locale}
                isPending={isPending}
                isActive={isPending && activeConnectionId === connection.id}
                onRefresh={refreshConnection}
                onRemove={removeConnection}
              />
            )) : connectionListReadable ? (
              <div className="rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center">
                <p className="text-sm font-medium text-white">{text("In der geladenen Übersicht ist noch keine Verbindung vorhanden.", "No connections in the loaded list.")}</p>
                <p className="mt-2 text-xs leading-5 text-white/60">
                  {text("Wähle einen unterstützten Broker, um seine Verbindungseinstellungen anzusehen.", "Select a supported broker to see its connection settings.")}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center">
                <p className="text-sm font-medium text-white">
                  {schemaState === 'missing'
                    ? text("Verbindungsübersicht nicht verfügbar.", "The connection list is unavailable.")
                    : text("Verbindungsübersicht derzeit nicht lesbar.", "The connection list could not be loaded.")}
                </p>
                <p className="mt-2 text-xs leading-5 text-white/60">
                  {text("Der gespeicherte Verbindungsbestand bleibt unbekannt. Leere Daten werden nicht als fehlende Brokerverbindung interpretiert.", "Your saved connections could not be checked.")}
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
  locale,
  isPending,
  isActive,
  onRefresh,
  onRemove,
}: {
  connection: BrokerConnectionSummary
  locale: JournalLocale
  isPending: boolean
  isActive: boolean
  onRefresh: (connectionId: string) => void
  onRemove: (connectionId: string, title: string) => void
}) {
  const text = journalText(locale)
  const provider = findBrokerProviderPresentation(connection.providerCode)
  const title = connection.accountLabel || provider?.displayName || text("Unbekannte Verbindung", "Unknown connection")
  const providerLabel = provider ? `${provider.displayName} ${provider.marketLabel}` : text("Nicht unterstützter Provider", "Unsupported provider")

  return (
    <article className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-1 text-xs text-white/60">{providerLabel} · {environmentLabel(connection.environment, locale)}</p>
        </div>
        <ConnectionStatus status={connection.status} locale={locale} />
      </div>

      <dl className="mt-4 grid gap-2 text-xs">
        <ConnectionDetail label={text("Technischer Leseerfolg", "Read check")} value={technicalReadLabel(connection.technicalReadResult, locale)} />
        <ConnectionDetail label={text("Leserechte laut Nutzer", "Read-only confirmation")} value={attestationLabel(connection.readOnlyAttestation, locale)} />
        <ConnectionDetail label={text("Prüfung der Berechtigungen", "Permission verification")} value={permissionEvidenceLabel(connection.permissionEvidence, locale)} />
        <ConnectionDetail label={text("Kontoidentität", "Linked account")} value={identityLabel(connection.accountIdentityResult, locale)} />
        <ConnectionDetail label={text("Erfasster Zeitraum", "History coverage")} value={coverageLabel(connection.historyCoverage, locale)} />
        <ConnectionDetail
          label={text("Letzter bestätigter Datenabruf", "Last confirmed retrieval")}
          value={formatCaptureDate(connection.lastCaptureAt, connection.historyCoverage, locale)}
        />
      </dl>

      {connection.hasSanitizedError ? (
        <p className="mt-3 rounded-xl border border-red-300/15 bg-red-400/6 px-3 py-2 text-xs leading-5 text-red-100/70">
          {text("Die letzte serverseitige Prüfung meldete einen Fehler. Ungefilterte Brokerantworten werden aus Sicherheitsgründen nicht angezeigt.", "The last server check reported an error.")}
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
            {isActive ? text("Ansicht wird aktualisiert …", "Refreshing view…") : text("Ansicht aktualisieren", "Refresh view")}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onRemove(connection.id, title)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60 transition hover:text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-45"
          >
            {text("Verbindung widerrufen", "Revoke connection")}
          </button>
        </div>
      ) : null}
    </article>
  )
}

function ConnectionStatus({ status, locale }: { status: BrokerConnectionSummary['status']; locale: JournalLocale }) {
  const text = journalText(locale)
  const labels: Record<BrokerConnectionSummary['status'], string> = {
    ready: text("Verbindung angelegt", "Connection saved"),
    draft: text("Setup offen", "Setup incomplete"),
    paused: text("Pausiert", "Paused"),
    error: text("Prüfung nötig", "Check needed"),
    revoked: text("Widerrufen", "Revoked"),
    unknown: text("Unbekannter Status", "Unknown status"),
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

function technicalReadLabel(value: BrokerConnectionSummary['technicalReadResult'], locale: JournalLocale) {
  const text = journalText(locale)
  return value === 'legacy_read_observed'
    ? text("Ein begrenzter früherer Leseabruf wurde bestätigt", "A previous limited read was confirmed")
    : text("Probe-Ergebnis nicht dauerhaft gespeichert", "No saved result for the read check")
}

function attestationLabel(value: BrokerConnectionSummary['readOnlyAttestation'], locale: JournalLocale) {
  const text = journalText(locale)
  return value === 'user_confirmed' ? text("Vom Nutzer bestätigt", "Confirmed by you") : text("Nicht bestätigt", "Unconfirmed")
}

function permissionEvidenceLabel(value: BrokerConnectionSummary['permissionEvidence'], locale: JournalLocale) {
  const text = journalText(locale)
  return value === 'limited_read_observed'
    ? text("Begrenzter Leseabruf bestätigt; vollständige Rechte nicht geprüft", "Limited read confirmed. Full permissions unverified.")
    : text("Keine dauerhafte technische Rechteübersicht", "No saved permission check")
}

function identityLabel(value: BrokerConnectionSummary['accountIdentityResult'], locale: JournalLocale) {
  const text = journalText(locale)
  return value === 'pseudonymous_binding_present'
    ? text("Konto über eine interne Kennung zugeordnet", "Account linked by internal ID")
    : text("Keine serverseitige Kontobindung sichtbar", "No account link is visible")
}

function coverageLabel(value: BrokerConnectionSummary['historyCoverage'], locale: JournalLocale) {
  const text = journalText(locale)
  if (value === 'capture_observed') return text("Datenabruf bestätigt; vollständiger Zeitraum nicht belegt", "Retrieval confirmed. Full history unverified.")
  if (value === 'unavailable') return text("Nachweis zum Datenabruf derzeit nicht verfügbar", "Retrieval record unavailable")
  return text("In verfügbaren Laufdaten nicht beobachtet", "No retrieval observed in the available history")
}

function environmentLabel(value: BrokerConnectionSummary['environment'], locale: JournalLocale) {
  const text = journalText(locale)
  if (value === 'live') return text("Live-Konto", "Live account")
  if (value === 'demo') return text("Demo-Konto", "Demo account")
  return text("Umgebung unbekannt", "Unknown environment")
}

function formatCaptureDate(
  value: string | null,
  coverage: BrokerConnectionSummary['historyCoverage'],
  locale: JournalLocale,
) {
  const text = journalText(locale)
  if (coverage === 'unavailable') return text("Derzeit nicht verfügbar", "Unavailable")
  if (!value) return text("Kein qualifizierter Lauf beobachtet", "No confirmed retrieval")
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text("Zeitpunkt des Nachweises ungültig", "Invalid retrieval date")
  return new Intl.DateTimeFormat(journalNumberLocale[locale], { dateStyle: 'short', timeStyle: 'short', timeZone: DEFAULT_TRADE_TIMEZONE }).format(date)
}
