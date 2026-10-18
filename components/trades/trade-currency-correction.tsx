'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { previewTradeCurrencyCorrection, applyTradeCurrencyCorrection } from '@/app/actions/trade-currency'
import { normalizeTradeCurrency, SUPPORTED_TRADE_CURRENCIES } from '@/lib/utils/currency'
import type { CurrencyCorrectionScope, CurrencyCorrectionSummary } from '@/lib/utils/trade-currency-correction'

type Preview = { token: string; summary: CurrencyCorrectionSummary }
const control = 'rounded-xl border border-white/20 bg-black px-3 py-2 text-sm text-white'
const button = 'rounded-xl border border-orange-300/30 bg-orange-400/10 px-4 py-2 text-sm text-orange-50 disabled:opacity-40'

export function TradeCurrencyCorrection({ editingTrade = false }: { editingTrade?: boolean }) {
  const router = useRouter()
  const [currency, setCurrency] = useState('USDT')
  const [scope, setScope] = useState<CurrencyCorrectionScope>('all')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  function reset() { setPreview(null); setConfirmed(false); setMessage('') }
  function loadPreview() {
    reset()
    startTransition(async () => {
      try {
        const result = await previewTradeCurrencyCorrection({ currency, scope })
        if (result.success) setPreview({ token: result.token, summary: result.summary })
        else setMessage(result.message)
      } catch { setMessage('Die Vorschau ist nicht verfügbar. Bitte später erneut versuchen.') }
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
        setMessage(result.message)
      } catch { setMessage('Der Speicherstand ist unklar. Bitte neu laden und prüfen. Es erfolgt keine automatische Wiederholung.') }
      router.refresh()
    })
  }
  if (editingTrade) return <p className="mt-4 text-xs leading-5 text-white/60">Beende zuerst die Trade-Bearbeitung. Danach kannst du mehrere Währungen gemeinsam ändern.</p>
  return <details id="trade-currency-correction" className="mt-4 rounded-2xl border border-white/15 bg-black/20 p-4">
    <summary className="cursor-pointer text-sm font-medium text-orange-100">Währung für mehrere Trades festlegen</summary>
    <div className="mt-4 space-y-4">
      <p className="max-w-2xl text-sm leading-6 text-white/70">Die Beträge bleiben gleich. Du änderst nur ihre Währungsangabe. Die Auswahl gilt unabhängig von deinen Suchfiltern.</p>
      <div className="flex flex-wrap gap-4">
        <label className="grid gap-2 text-sm text-white/75">Ergebniswährung
          <select className={control} value={currency} disabled={pending} onChange={event => { reset(); setCurrency(event.target.value) }}>
            {SUPPORTED_TRADE_CURRENCIES.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm text-white/75">Anwenden auf
          <select className={control} value={scope} disabled={pending} onChange={event => { reset(); setScope(event.target.value as CurrencyCorrectionScope) }}>
            <option value="all">Alle meine Trades</option>
            <option value="missing">Nur Trades ohne Währung</option>
          </select>
        </label>
      </div>
      <button type="button" disabled={pending} onClick={loadPreview} className={button}>{pending ? 'Bitte warten…' : 'Vorschau laden'}</button>
      {preview ? <div className="space-y-3 rounded-xl border border-orange-300/25 p-4" aria-live="polite">
        <p className="text-sm text-white">{preview.summary.changes} Trades auf {currency} setzen · {preview.summary.total} insgesamt</p>
        <ul className="space-y-1 text-sm text-white/70">
          <li>{preview.summary.missing} {preview.summary.missing === 1 ? 'fehlende Währung' : 'fehlende Währungen'} ergänzen</li>
          <li>{preview.summary.replacements} {preview.summary.replacements === 1 ? 'vorhandene Währungsangabe' : 'vorhandene Währungsangaben'} ersetzen</li>
          <li>{preview.summary.alreadyCorrect} {preview.summary.alreadyCorrect === 1 ? 'Trade hat' : 'Trades haben'} bereits {currency}</li>
        </ul>
        {preview.summary.changes ? <>
          <label className="flex items-start gap-3 text-sm leading-6 text-white/80">
            <input className="mt-1 shrink-0" type="checkbox" checked={confirmed} disabled={pending} onChange={event => setConfirmed(event.target.checked)} />
            Diese {preview.summary.changes} Ergebnisse liegen in {currency} vor.{preview.summary.replacements ? ' Vorhandene Währungen dürfen ersetzt werden.' : ''}
          </label>
          <button type="button" disabled={pending || !confirmed} className={button} onClick={save}>{currency} für {preview.summary.changes} Trades speichern</button>
        </> : <p className="text-sm text-white/70">Für diese Auswahl ist keine Änderung nötig.</p>}
      </div> : null}
      {message ? <p role="status" className="text-sm leading-6 text-orange-100">{message}</p> : null}
    </div>
  </details>
}

export function SaveTradeCurrencyOnly({ tradeId, currency, disabled = false, onBusyChange }: { tradeId: string; currency: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  function save() {
    onBusyChange?.(true)
    startTransition(async () => {
      try {
        const selection = { tradeId, currency, scope: 'all' as const }
        const preview = await previewTradeCurrencyCorrection(selection)
        if (!preview.success) { setMessage(preview.message); return }
        const result = await applyTradeCurrencyCorrection({ ...selection, token: preview.token, confirmed: true })
        setMessage(result.message)
      } catch { setMessage('Der Speicherstand konnte nicht bestätigt werden. Bitte neu laden und prüfen.') }
      finally { onBusyChange?.(false) }
      router.refresh()
    })
  }
  return <div className="mt-3 space-y-2">
    <button type="button" disabled={disabled || pending || !normalizeTradeCurrency(currency)} onClick={save} className={button}>{pending ? 'Speichert…' : 'Nur Währung speichern'}</button>
    <p className="text-xs leading-5 text-white/60">Keine Entry- oder Exit-Preise nötig. Weitere Formulareingaben bleiben ungespeichert.</p>
    {message ? <p role="status" className="text-sm text-orange-100">{message}</p> : null}
  </div>
}
