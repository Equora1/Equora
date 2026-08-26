'use client'

import { useState, useTransition, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { connectMexcBroker } from '@/app/actions/broker-sync'
import type { BrokerDependencyState } from '@/lib/server/broker-sync'

type Feedback = Readonly<{
  tone: 'success' | 'error'
  message: string
}> | null

export function MexcConnectionSetup({
  connectorState,
  secureStoreState,
}: {
  connectorState: BrokerDependencyState
  secureStoreState: BrokerDependencyState
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [accountLabel, setAccountLabel] = useState('MEXC Futures')
  const [symbols, setSymbols] = useState('BTC_USDT')
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [readOnlyConfirmed, setReadOnlyConfirmed] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    startTransition(async () => {
      const result = await connectMexcBroker({
        accountLabel,
        symbols,
        apiKey,
        secretKey,
        readOnlyConfirmed,
      })
      setFeedback({ tone: result.success ? 'success' : 'error', message: result.message })

      if (result.success) {
        setApiKey('')
        setSecretKey('')
        setReadOnlyConfirmed(false)
        router.refresh()
      }
    })
  }

  const disabled = isPending || connectorState !== 'ready'

  return (
    <section aria-labelledby="mexc-setup-title" className="rounded-3xl border border-white/8 bg-white/[0.02] p-5 sm:p-6">
      <div>
        <p className="eq-display text-[0.58rem] text-[#b09a7a]">MEXC Futures</p>
        <h3 id="mexc-setup-title" className="mt-2 text-xl font-semibold text-white">Providerfelder für MEXC</h3>
        <p className="mt-3 text-sm leading-6 text-white/60">
          Diese Felder gehören ausschließlich zum MEXC-Setup. Die providerneutrale Übersicht erhält weder API Key
          noch Secret und erzeugt kein sendefähiges Brokerrequestobjekt.
        </p>
      </div>

      {connectorState !== 'ready' ? (
        <div role="status" className="mt-5 rounded-2xl border border-[#e5a14d]/20 bg-[#e5a14d]/8 px-4 py-3 text-sm leading-6 text-[#efc98f]">
          {connectorState === 'not_read'
            ? 'Der Status von Secure Store und Connectorvoraussetzungen wurde über diesen begrenzten Read-Pfad nicht gelesen. Das Setupformular dieser Ansicht ist deshalb nicht verfügbar.'
            : secureStoreState === 'ready'
              ? 'Der MEXC-Connector ist in der Serverumgebung deaktiviert. Es werden keine Brokerrequests ausgeführt.'
              : 'Die serverseitige Secure-Store-Grundlage ist nachweislich nicht verfügbar. Es werden keine Credentials übertragen.'}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
          <legend className="sr-only">MEXC-Verbindungsdaten</legend>

          <label className="block">
            <span className="text-xs font-medium text-white/65">Name der Verbindung</span>
            <input
              value={accountLabel}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setAccountLabel(event.target.value)}
              maxLength={60}
              autoComplete="off"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/55 focus:border-[#c8823a]/45 focus-visible:ring-2 focus-visible:ring-[#f0a855]/50"
              placeholder="Zum Beispiel: MEXC Hauptkonto"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-white/65">MEXC Futures-Symbole</span>
            <input
              value={symbols}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSymbols(event.target.value.toUpperCase())}
              required
              maxLength={104}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="mexc-symbol-hint"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/55 focus:border-[#c8823a]/45 focus-visible:ring-2 focus-visible:ring-[#f0a855]/50"
              placeholder="BTC_USDT, ETH_USDT"
            />
            <span id="mexc-symbol-hint" className="mt-2 block text-[11px] leading-5 text-white/60">
              1 bis 5 Symbole, durch Komma oder Leerzeichen getrennt.
            </span>
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
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/55 focus:border-[#c8823a]/45 focus-visible:ring-2 focus-visible:ring-[#f0a855]/50"
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
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/55 focus:border-[#c8823a]/45 focus-visible:ring-2 focus-visible:ring-[#f0a855]/50"
              placeholder="Secret Key einfügen"
            />
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4 focus-within:ring-2 focus-within:ring-[#f0a855]/50">
            <input
              type="checkbox"
              required
              checked={readOnlyConfirmed}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setReadOnlyConfirmed(event.target.checked)}
              aria-describedby="mexc-readonly-hint"
              className="mt-1 h-4 w-4 accent-[#c8823a]"
            />
            <span id="mexc-readonly-hint" className="text-xs leading-5 text-white/55">
              Ich bestätige, dass Handels-, Transfer- und Auszahlungsrechte für diesen Schlüssel ausgeschaltet sind.
              Diese Nutzerbestätigung ist keine technische Gesamtprüfung aller Providerrechte.
            </span>
          </label>

          <button
            type="submit"
            className="w-full rounded-2xl border border-[#c8823a]/35 bg-[#c8823a]/15 px-4 py-3 text-sm font-medium text-[#ffd3a0] transition hover:bg-[#c8823a]/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isPending ? 'Lesecapabilities werden geprüft …' : 'Lesecapabilities prüfen'}
          </button>
        </fieldset>
      </form>

      <p className="mt-4 text-xs leading-5 text-white/60">
        Der Probe prüft fest definierte Leseabrufe, aber keine globale Rechteübersicht und keine vollständige Historie.
        Ein fehlgeschlagener Probe aktiviert keine Connection und startet weder Capture noch Journalimport.
      </p>

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
  )
}
