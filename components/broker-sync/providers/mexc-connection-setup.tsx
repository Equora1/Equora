'use client'

import { useState, useTransition, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { connectMexcBroker } from '@/app/actions/broker-sync'
import type { BrokerDependencyState } from '@/lib/server/broker-sync'

type Feedback = Readonly<{
  tone: 'success' | 'error'
  message: string
}> | null

export function MexcConnectionSetup({
  locale = 'de',
  connectorState,
  secureStoreState,
}: {
  locale?: JournalLocale
  connectorState: BrokerDependencyState
  secureStoreState: BrokerDependencyState
}) {
  const text = journalText(locale)
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
      }, locale)
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
        <h3 id="mexc-setup-title" className="mt-2 text-xl font-semibold text-white">{text("MEXC-Verbindung einrichten", "Set up a MEXC connection")}</h3>
        <p className="mt-3 text-sm leading-6 text-white/60">
          {text("Die folgenden Angaben werden nur für die MEXC-Verbindung verwendet. Zugangsschlüssel erscheinen nach dem Speichern nicht in der Übersicht.", "These details are used only for the MEXC connection. Keys are hidden after saving.")}
        </p>
      </div>

      {connectorState !== 'ready' ? (
        <div role="status" className="mt-5 rounded-2xl border border-[#e5a14d]/20 bg-[#e5a14d]/8 px-4 py-3 text-sm leading-6 text-[#efc98f]">
          {connectorState === 'not_read'
            ? text("Die Voraussetzungen für eine sichere Verbindung konnten hier nicht geprüft werden. Das Formular bleibt deshalb deaktiviert.", "Setup is disabled because this view cannot verify the connection requirements.")
            : secureStoreState === 'ready'
              ? text("Der MEXC-Abruf ist deaktiviert. Es werden keine Anfragen an den Broker gesendet.", "MEXC data access is off. No requests are sent to the broker.")
              : text("Die sichere Speicherung von Zugangsschlüsseln ist nicht eingerichtet. Es werden keine Zugangsdaten übertragen.", "Secure key storage is unavailable. No credentials are sent.")}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
          <legend className="sr-only">{text("MEXC-Verbindungsdaten", "MEXC connection details")}</legend>

          <label className="block">
            <span className="text-xs font-medium text-white/65">{text("Name der Verbindung", "Connection name")}</span>
            <input
              value={accountLabel}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setAccountLabel(event.target.value)}
              maxLength={60}
              autoComplete="off"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/55 focus:border-[#c8823a]/45 focus-visible:ring-2 focus-visible:ring-[#f0a855]/50"
              placeholder={text("Zum Beispiel: MEXC Hauptkonto", "For example, MEXC main account")}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-white/65">{text("MEXC Futures-Symbole", "MEXC futures symbols")}</span>
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
              {text("1 bis 5 Symbole, durch Komma oder Leerzeichen getrennt.", "Enter 1 to 5 symbols separated by commas or spaces.")}
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-white/65">{text("MEXC API-Schlüssel", "MEXC API key")}</span>
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
              placeholder={text("API-Schlüssel einfügen", "Paste API key")}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-white/65">{text("MEXC Secret Key", "MEXC secret key")}</span>
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
              placeholder={text("Secret Key einfügen", "Paste secret key")}
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
              {text("Ich bestätige, dass Handels-, Transfer- und Auszahlungsrechte für diesen Schlüssel ausgeschaltet sind. Diese Nutzerbestätigung ist keine technische Gesamtprüfung aller Providerrechte.", "I confirm that this key cannot trade, transfer or withdraw funds. This confirmation does not verify all broker permissions.")}
            </span>
          </label>

          <button
            type="submit"
            className="w-full rounded-2xl border border-[#c8823a]/35 bg-[#c8823a]/15 px-4 py-3 text-sm font-medium text-[#ffd3a0] transition hover:bg-[#c8823a]/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isPending ? text("Lesezugriff wird geprüft …", "Checking read access…") : text("Lesezugriff prüfen", "Check read access")}
          </button>
        </fieldset>
      </form>

      <p className="mt-4 text-xs leading-5 text-white/60">
        {text("Der Verbindungstest prüft einzelne Leseabrufe, aber nicht alle Schlüsselrechte oder die vollständige Handelshistorie. Ein fehlgeschlagener Test aktiviert keine Verbindung und startet keine Datenübernahme.", "The connection check verifies selected reads. Full key permissions and trade history require separate checks. A failed check leaves the connection inactive and starts no data retrieval.")}
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
