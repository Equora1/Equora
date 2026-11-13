'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { previewTradeCurrencyCorrection, applyTradeCurrencyCorrection } from '@/app/actions/trade-currency'
import { normalizeTradeCurrency, SUPPORTED_TRADE_CURRENCIES } from '@/lib/utils/currency'
import type { CurrencyCorrectionScope, CurrencyCorrectionSummary } from '@/lib/utils/trade-currency-correction'

type Preview = { token: string; summary: CurrencyCorrectionSummary }
const control = 'rounded-xl border border-white/20 bg-black px-3 py-2 text-sm text-white'
const button = 'rounded-xl border border-orange-300/30 bg-orange-400/10 px-4 py-2 text-sm text-orange-50 disabled:opacity-40'

export function TradeCurrencyCorrection({ editingTrade = false }: { editingTrade?: boolean }) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const router = useRouter()
  const [currency, setCurrency] = useState('USDT')
  const [scope, setScope] = useState<CurrencyCorrectionScope>('all')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState<{ text: string; lang: JournalLocale } | null>(null)
  const [pending, startTransition] = useTransition()
  function reset() { setPreview(null); setConfirmed(false); setMessage(null) }
  function loadPreview() {
    reset()
    startTransition(async () => {
      try {
        const result = await previewTradeCurrencyCorrection({ currency, scope })
        if (result.success) setPreview({ token: result.token, summary: result.summary })
        else setMessage({ text: result.message, lang: 'de' })
      } catch { setMessage({ text: text('Die Vorschau ist nicht verfügbar. Bitte später erneut versuchen.', 'The preview is unavailable. Please try again later.'), lang: locale }) }
    })
  }
  function save() {
    if (!preview || !confirmed) return
    const token = preview.token
    setPreview(null)
    setConfirmed(false)
    startTransition(async () => {
      try {
        const result = await applyTradeCurrencyCorrection({ currency, scope, token, confirmed: true })
        setMessage(result.success && locale === 'en'
          ? { text: `Set ${result.saved} ${result.saved === 1 ? 'trade' : 'trades'} to ${currency}. The amounts were kept as entered.`, lang: 'en' }
          : { text: result.message, lang: 'de' })
      } catch { setMessage({ text: text('Der Speicherstand ist unklar. Bitte neu laden und prüfen. Es erfolgt keine automatische Wiederholung.', 'The save could not be confirmed. Reload to check the current state before trying again.'), lang: locale }) }
      router.refresh()
    })
  }
  if (editingTrade) return <p className="mt-4 text-xs leading-5 text-white/60">{text('Beende zuerst die Trade-Bearbeitung. Danach kannst du mehrere Währungen gemeinsam ändern.', 'Finish editing the trade before setting the currency for multiple trades.')}</p>
  return <details id="trade-currency-correction" className="mt-4 rounded-2xl border border-white/15 bg-black/20 p-4">
    <summary className="cursor-pointer text-sm font-medium text-orange-100">{text('Währung für mehrere Trades festlegen', 'Set currency for multiple trades')}</summary>
    <div className="mt-4 space-y-4">
      <p className="max-w-2xl text-sm leading-6 text-white/70">{text('Die Beträge bleiben gleich. Du änderst nur ihre Währungsangabe. Die Auswahl gilt unabhängig von deinen Suchfiltern.', 'This sets the currency and keeps the amounts as entered. The selection applies across the journal, regardless of your filters.')}</p>
      <div className="flex flex-wrap gap-4">
        <label className="grid gap-2 text-sm text-white/75">{text('Ergebniswährung', 'P&L currency')}
          <select className={control} value={currency} disabled={pending} onChange={event => { reset(); setCurrency(event.target.value) }}>
            {SUPPORTED_TRADE_CURRENCIES.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm text-white/75">{text('Anwenden auf', 'Apply to')}
          <select className={control} value={scope} disabled={pending} onChange={event => { reset(); setScope(event.target.value as CurrencyCorrectionScope) }}>
            <option value="all">{text('Alle meine Trades', 'All my trades')}</option>
            <option value="missing">{text('Nur Trades ohne Währung', 'Only trades without a currency')}</option>
          </select>
        </label>
      </div>
      <button type="button" disabled={pending} onClick={loadPreview} className={button}>{pending ? text('Bitte warten…', 'Please wait…') : text('Vorschau laden', 'Load preview')}</button>
      {preview ? <div className="space-y-3 rounded-xl border border-orange-300/25 p-4" aria-live="polite">
        <p className="text-sm text-white">{text(`${preview.summary.changes} Trades auf ${currency} setzen · ${preview.summary.total} insgesamt`, `Set ${preview.summary.changes} ${preview.summary.changes === 1 ? 'trade' : 'trades'} to ${currency} · ${preview.summary.total} total`)}</p>
        <ul className="space-y-1 text-sm text-white/70">
          <li>{text(`${preview.summary.missing} ${preview.summary.missing === 1 ? 'fehlende Währung' : 'fehlende Währungen'} ergänzen`, `Fill in ${preview.summary.missing} missing ${preview.summary.missing === 1 ? 'currency' : 'currencies'}`)}</li>
          <li>{text(`${preview.summary.replacements} ${preview.summary.replacements === 1 ? 'vorhandene Währungsangabe' : 'vorhandene Währungsangaben'} ersetzen`, `Replace the currency on ${preview.summary.replacements} ${preview.summary.replacements === 1 ? 'trade' : 'trades'}`)}</li>
          <li>{text(`${preview.summary.alreadyCorrect} ${preview.summary.alreadyCorrect === 1 ? 'Trade hat' : 'Trades haben'} bereits ${currency}`, `${preview.summary.alreadyCorrect} ${preview.summary.alreadyCorrect === 1 ? 'trade already uses' : 'trades already use'} ${currency}`)}</li>
        </ul>
        {preview.summary.changes ? <>
          <label className="flex items-start gap-3 text-sm leading-6 text-white/80">
            <input className="mt-1 shrink-0" type="checkbox" checked={confirmed} disabled={pending} onChange={event => setConfirmed(event.target.checked)} />
            {text(`Diese ${preview.summary.changes} Ergebnisse liegen in ${currency} vor.`, `I confirm the P&L for ${preview.summary.changes === 1 ? 'this trade' : `these ${preview.summary.changes} trades`} is in ${currency}.`)}
            {preview.summary.replacements ? text(' Vorhandene Währungen dürfen ersetzt werden.', ' Existing currency entries may be replaced.') : ''}
          </label>
          <button type="button" disabled={pending || !confirmed} className={button} onClick={save}>{text(`${currency} für ${preview.summary.changes} Trades speichern`, `Save ${currency} for ${preview.summary.changes} ${preview.summary.changes === 1 ? 'trade' : 'trades'}`)}</button>
        </> : <p className="text-sm text-white/70">{text('Für diese Auswahl ist keine Änderung nötig.', 'This selection needs no changes.')}</p>}
      </div> : null}
      {message ? <p role="status" lang={message.lang} className="text-sm leading-6 text-orange-100">{message.text}</p> : null}
    </div>
  </details>
}

export function SaveTradeCurrencyOnly({ tradeId, currency, disabled = false, onBusyChange }: { tradeId: string; currency: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ text: string; lang: JournalLocale } | null>(null)
  function save() {
    onBusyChange?.(true)
    startTransition(async () => {
      try {
        const selection = { tradeId, currency, scope: 'all' as const }
        const preview = await previewTradeCurrencyCorrection(selection)
        if (!preview.success) { setMessage({ text: preview.message, lang: 'de' }); return }
        const result = await applyTradeCurrencyCorrection({ ...selection, token: preview.token, confirmed: true })
        setMessage(result.success && locale === 'en'
          ? { text: `Set ${result.saved} ${result.saved === 1 ? 'trade' : 'trades'} to ${currency}. The amounts were kept as entered.`, lang: 'en' }
          : { text: result.message, lang: 'de' })
      } catch { setMessage({ text: text('Der Speicherstand konnte nicht bestätigt werden. Bitte neu laden und prüfen.', 'The save could not be confirmed. Reload to check the current state.'), lang: locale }) }
      finally { onBusyChange?.(false) }
      router.refresh()
    })
  }
  return <div className="mt-3 space-y-2">
    <button type="button" disabled={disabled || pending || !normalizeTradeCurrency(currency)} onClick={save} className={button}>{pending ? text('Speichert…', 'Saving…') : text('Nur Währung speichern', 'Save currency only')}</button>
    <p className="text-xs leading-5 text-white/60">{text('Keine Entry- oder Exit-Preise nötig. Weitere Formulareingaben bleiben ungespeichert.', 'Entry and exit prices are optional here. This saves the currency only.')}</p>
    {message ? <p role="status" lang={message.lang} className="text-sm text-orange-100">{message.text}</p> : null}
  </div>
}
