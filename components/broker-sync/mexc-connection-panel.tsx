'use client'

import { useState, useTransition, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  connectMexcBroker,
  refreshMexcPreview,
  removeBrokerConnection,
} from '@/app/actions/broker-sync'
import type { BrokerConnectionRow } from '@/lib/types/db'

type Feedback = {
  tone: 'success' | 'error'
  message: string
} | null

export function MexcConnectionPanel({
  connections,
  connectorReady,
  secureStoreReady,
}: {
  connections: BrokerConnectionRow[]
  connectorReady: boolean
  secureStoreReady: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [accountLabel, setAccountLabel] = useState('MEXC Futures')
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [readOnlyConfirmed, setReadOnlyConfirmed] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setActiveConnectionId('new')

    startTransition(async () => {
      const result = await connectMexcBroker({
        accountLabel,
        apiKey,
        secretKey,
        readOnlyConfirmed,
      })
      setFeedback({ tone: result.success ? 'success' : 'error', message: result.message })
      setActiveConnectionId(null)

      if (result.success) {
        setApiKey('')
        setSecretKey('')
        setReadOnlyConfirmed(false)
        router.refresh()
      }
    })
  }

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
    const confirmed = window.confirm(`Verbindung „${title}“ wirklich entfernen? Der verschlüsselte Zugang wird ebenfalls gelöscht.`)
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

  const disabled = isPending || !connectorReady

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
        <div>
          <p className="eq-display text-[0.58rem] text-[#b09a7a]">MEXC Futures</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Neue Verbindung einrichten</h3>
          <p className="mt-3 text-sm leading-6 text-white/48">
            Nach einem bestandenen G1 darf Equora fest benannte Lesecapabilities für einen gewählten Scope prüfen.
            Derzeit sind Brokerabruf und Journalimport vollständig gesperrt.
          </p>
        </div>

        {!connectorReady ? (
          <div className="mt-5 rounded-2xl border border-[#e5a14d]/20 bg-[#e5a14d]/8 px-4 py-3 text-sm leading-6 text-[#efc98f]">
            {secureStoreReady
              ? 'Der MEXC-Connector ist bis zum bestandenen Gate G1 gesperrt. Es werden keine Brokerrequests ausgeführt.'
              : 'Bitte zuerst die SQL-Patches v57.60 und v57.60.1 ausführen und die Servervariablen in Vercel prüfen.'}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-white/65">Name der Verbindung</span>
            <input
              value={accountLabel}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setAccountLabel(event.target.value)}
              maxLength={60}
              autoComplete="off"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#c8823a]/45"
              placeholder="Zum Beispiel: MEXC Hauptkonto"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-white/65">MEXC API-Schlüssel</span>
            <input
              value={apiKey}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setApiKey(event.target.value)}
              type="password"
              required
              minLength={8}
              maxLength={256}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#c8823a]/45"
              placeholder="API-Schlüssel einfügen"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-white/65">MEXC Secret Key</span>
            <input
              value={secretKey}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSecretKey(event.target.value)}
              type="password"
              required
              minLength={8}
              maxLength={256}
              autoComplete="new-password"
              spellCheck={false}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#c8823a]/45"
              placeholder="Secret Key einfügen"
            />
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
            <input
              type="checkbox"
              checked={readOnlyConfirmed}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setReadOnlyConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[#c8823a]"
            />
            <span className="text-xs leading-5 text-white/55">
              Ich habe für diesen Schlüssel nur Futures-Leserechte aktiviert. Handels-, Transfer- und
              Auszahlungsrechte sind ausgeschaltet.
            </span>
          </label>

          <button
            type="submit"
            disabled={disabled}
            className="w-full rounded-2xl border border-[#c8823a]/35 bg-[#c8823a]/15 px-4 py-3 text-sm font-medium text-[#ffd3a0] transition hover:bg-[#c8823a]/22 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isPending && activeConnectionId === 'new' ? 'Lesecapabilities werden geprüft …' : 'Lesecapabilities prüfen'}
          </button>
        </form>

        <p className="mt-4 text-xs leading-5 text-white/35">
          MEXC bestätigt über die Leseschnittstelle, ob der Abruf funktioniert. Eine vollständige Rechteübersicht liefert
          dieser Endpunkt nicht. Deshalb prüft Equora niemals testweise eine Order und verlangt zusätzlich deine
          Read-only-Bestätigung.
        </p>
      </section>

      <section className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eq-display text-[0.58rem] text-[#b09a7a]">Deine Konten</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Gespeicherte Verbindungen</h3>
          </div>
          <span className="text-xs text-white/35">{connections.length}</span>
        </div>

        <div className="mt-5 space-y-3">
          {connections.length ? connections.map((connection) => {
            const title = connection.account_label || 'MEXC Futures'
            const isActive = isPending && activeConnectionId === connection.id
            return (
              <article key={connection.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="mt-1 text-xs text-white/38">MEXC Futures · gespeicherte Verbindung</p>
                  </div>
                  <ConnectionStatus status={connection.status} connectorReady={connectorReady} />
                </div>

                <dl className="mt-4 grid gap-2 text-xs">
                  <ConnectionDetail label="Letzte Prüfung" value={formatDate(connection.last_sync_at)} />
                  <ConnectionDetail label="Zugriff" value={permissionLabel(connection.permissions)} />
                </dl>

                {connection.last_error ? (
                  <p className="mt-3 rounded-xl border border-red-300/15 bg-red-400/6 px-3 py-2 text-xs leading-5 text-red-100/70">
                    {connection.last_error}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isPending || !connectorReady}
                    onClick={() => refreshConnection(connection.id)}
                    className="rounded-full border border-[#c8823a]/25 bg-[#c8823a]/10 px-3 py-1.5 text-xs text-[#f3bd7f] transition hover:bg-[#c8823a]/16 disabled:opacity-45"
                  >
                    {isActive ? 'Wird geprüft …' : 'Daten erneut prüfen'}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => removeConnection(connection.id, title)}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/48 transition hover:text-white/70 disabled:opacity-45"
                  >
                    Verbindung entfernen
                  </button>
                </div>
              </article>
            )
          }) : (
            <div className="rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center">
              <p className="text-sm font-medium text-white">Noch kein Broker verbunden.</p>
              <p className="mt-2 text-xs leading-5 text-white/40">
                Lege links einen MEXC-Schlüssel mit ausschließlich Leserechten an.
              </p>
            </div>
          )}
        </div>

        {feedback ? (
          <div
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
  )
}

function ConnectionStatus({ status, connectorReady }: { status: string; connectorReady: boolean }) {
  if (!connectorReady) {
    return <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/52">G1 gesperrt</span>
  }
  const labels: Record<string, string> = {
    ready: 'Legacy-Vorschau',
    draft: 'Noch offen',
    paused: 'Pausiert',
    error: 'Prüfen',
    revoked: 'Entfernt',
  }
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/52">
      {labels[status] ?? 'Unbekannt'}
    </span>
  )
}

function ConnectionDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-white/38">{label}</dt>
      <dd className="text-right text-white/62">{value}</dd>
    </div>
  )
}

function permissionLabel(permissions?: string[] | null) {
  if (!permissions?.length) return 'Noch nicht bestätigt'
  if (permissions.includes('historical_orders_read_observed') && permissions.includes('historical_executions_read_observed')) return 'Orders und Ausführungen beobachtet (Legacy)'
  if (permissions.includes('historical_orders_read_observed')) return 'Historische Orders beobachtet (Legacy)'
  if (permissions.includes('read_only_user_attested')) return 'Read-only vom Nutzer bestätigt'
  return 'Gespeicherter Legacy-Status'
}

function formatDate(value?: string | null) {
  if (!value) return 'Noch nicht geprüft'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Noch nicht geprüft'
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}
