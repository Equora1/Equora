'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createTradeEntry } from '@/app/actions/trades'
import { buildQuickPnLPreview, formatCurrency, formatRMultiple, parseTradingNumber } from '@/lib/utils/calculations'

type LedgerRow = {
  id: string
  tradeOccurredAt: string
  market: string
  direction: '' | 'Long' | 'Short'
  entry: string
  exit: string
  stopLoss: string
  positionSize: string
  setup: string
  emotion: string
  status: string
}

function localDateTimeValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function createBlankRow(prefill?: Partial<LedgerRow>): LedgerRow {
  return {
    id: crypto.randomUUID(),
    tradeOccurredAt: localDateTimeValue(),
    market: '',
    direction: '',
    entry: '',
    exit: '',
    stopLoss: '',
    positionSize: '',
    setup: '',
    emotion: '',
    status: '',
    ...prefill,
  }
}

function hasLedgerInput(row: LedgerRow) {
  return Boolean(
    row.market.trim() ||
    row.direction ||
    row.entry.trim() ||
    row.exit.trim() ||
    row.stopLoss.trim() ||
    row.positionSize.trim() ||
    row.setup.trim() ||
    row.emotion.trim(),
  )
}

function ensureTrailingBlankRow(rows: LedgerRow[]) {
  const lastRow = rows.at(-1)
  if (!lastRow || hasLedgerInput(lastRow)) return [...rows, createBlankRow()]
  return rows
}

function getLedgerQuickPnL(row: LedgerRow) {
  return buildQuickPnLPreview({
    entry: row.entry,
    exit: row.exit,
    positionSize: row.positionSize,
    pointValue: '',
    bias: row.direction,
    instrumentType: 'unknown',
    totalCosts: 0,
  })
}

function getLedgerRiskAmount(row: LedgerRow) {
  const entry = parseTradingNumber(row.entry)
  const stopLoss = parseTradingNumber(row.stopLoss)
  const positionSize = parseTradingNumber(row.positionSize)
  const direction = row.direction.toLowerCase()

  if (entry === null || stopLoss === null || positionSize === null || positionSize <= 0) return null

  const priceRisk = direction === 'short' ? stopLoss - entry : entry - stopLoss
  if (priceRisk <= 0) return null

  const riskAmount = priceRisk * positionSize
  return Number.isFinite(riskAmount) && riskAmount > 0 ? riskAmount : null
}

function getLedgerQuickR(row: LedgerRow) {
  const netPnL = getLedgerQuickPnL(row).netPnL
  const riskAmount = getLedgerRiskAmount(row)

  if (netPnL === null || riskAmount === null) return null
  const rMultiple = netPnL / riskAmount
  return Number.isFinite(rMultiple) ? rMultiple : null
}

function getLedgerQuickPnLLabel(row: LedgerRow) {
  const preview = getLedgerQuickPnL(row)
  const quickR = getLedgerQuickR(row)
  if (preview.netPnL !== null) return quickR !== null ? `${formatCurrency(preview.netPnL, 2)} · ${formatRMultiple(quickR, 2)}` : formatCurrency(preview.netPnL, 2)
  if (!row.entry && !row.exit && !row.positionSize) return '—'
  return preview.missing.length ? preview.missing.join(' · ') : '—'
}

function getLedgerQuickTone(row: LedgerRow) {
  const preview = getLedgerQuickPnL(row)
  if (preview.netPnL === null) return 'empty'
  if (preview.netPnL > 0) return 'positive'
  if (preview.netPnL < 0) return 'negative'
  return 'flat'
}

function getMissingLedgerFields(row: LedgerRow) {
  const missing: string[] = []
  if (!row.setup.trim()) missing.push('Setup')
  if (!row.direction.trim()) missing.push('Richtung')
  if (!row.entry.trim()) missing.push('Entry')
  if (!row.stopLoss.trim()) missing.push('Stop')
  return missing
}

function getLedgerCaptureStatus(row: LedgerRow) {
  const hasCloseContext = Boolean(row.exit.trim())
  const hasReliablePnL = getLedgerQuickPnL(row).netPnL !== null
  return getMissingLedgerFields(row).length || !hasCloseContext || !hasReliablePnL ? 'incomplete' : 'complete'
}

function getLedgerCaptureResult(row: LedgerRow) {
  if (!row.exit.trim()) return 'open'
  return undefined
}

function buildFollowUpMessage(row: LedgerRow) {
  const missing = getMissingLedgerFields(row)
  const hints: string[] = []

  if (!row.exit.trim()) hints.push('offen')
  if (missing.length) hints.push(`fehlt: ${missing.join(', ')}`)

  if (!hints.length) return ''
  return ` ${hints.join(' · ')}.`
}

export function TradeLedgerCapture({
  marketOptions,
  setupOptions,
  emotionOptions,
}: {
  marketOptions: string[]
  setupOptions: string[]
  emotionOptions: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const marketInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [rows, setRows] = useState<LedgerRow[]>(() => [createBlankRow(), createBlankRow()])
  const [isPending, startTransition] = useTransition()
  const [isFocusedEntry, setIsFocusedEntry] = useState(false)

  const knownMarkets = useMemo(() => marketOptions.slice(0, 24), [marketOptions])
  const knownSetups = useMemo(() => setupOptions.slice(0, 24), [setupOptions])
  const knownEmotions = useMemo(() => emotionOptions.slice(0, 24), [emotionOptions])

  useEffect(() => {
    if (searchParams.get('focus') !== 'ledger') return

    setIsFocusedEntry(true)
    const firstRowId = rows[0]?.id
    const timer = window.setTimeout(() => {
      if (firstRowId) marketInputRefs.current[firstRowId]?.focus()
    }, 120)
    const resetTimer = window.setTimeout(() => setIsFocusedEntry(false), 1800)

    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(resetTimer)
    }
  }, [rows, searchParams])

  function updateRow(rowId: string, patch: Partial<LedgerRow>) {
    setRows((current) => ensureTrailingBlankRow(current.map((row) => (row.id === rowId ? { ...row, ...patch } : row))))
  }

  function addRow() {
    const nextRow = createBlankRow()
    setRows((current) => [...current, nextRow])
    window.setTimeout(() => marketInputRefs.current[nextRow.id]?.focus(), 80)
  }

  function removeRow(rowId: string) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== rowId) : [createBlankRow()]))
  }

  function saveRow(row: LedgerRow) {
    if (!row.market.trim()) {
      updateRow(row.id, { status: 'Bitte zuerst einen Markt eintragen.' })
      return
    }

    updateRow(row.id, { status: 'Speichert ...' })

    startTransition(async () => {
      const result = await createTradeEntry({
        market: row.market.trim(),
        setup: row.setup.trim() || 'Später ergänzen',
        setupId: '',
        emotion: row.emotion.trim(),
        bias: row.direction,
        ruleCheck: '',
        reviewRepeatability: '',
        reviewState: '',
        reviewLesson: '',
        tradeOccurredAt: row.tradeOccurredAt,
        entry: row.entry,
        stopLoss: row.stopLoss,
        takeProfit: '',
        exit: row.exit,
        netPnL: '',
        riskPercent: '',
        accountSize: '',
        marginUsed: '',
        rMultiple: '',
        pnlMode: getLedgerQuickPnL(row).netPnL !== null ? 'auto' : 'manual',
        costProfile: 'manual',
        brokerProfile: 'manual',
        instrumentType: 'unknown',
        accountTemplate: 'manual',
        marketTemplate: 'manual',
        positionSize: row.positionSize,
        pointValue: '',
        fees: '',
        exchangeFees: '',
        fundingFees: '',
        fundingRateBps: '',
        fundingIntervals: '',
        spreadCost: '',
        slippage: '',
        accountCurrency: '',
        cryptoMarketType: 'manual',
        executionType: 'manual',
        fundingDirection: 'manual',
        quoteAsset: '',
        leverage: '',
        partialExit1Percent: '',
        partialExit1Price: '',
        partialExit2Percent: '',
        partialExit2Price: '',
        partialExit3Percent: '',
        partialExit3Price: '',
        userCostProfileId: '',
        notes: '',
        screenshotUrl: '',
        tags: [],
        captureStatus: getLedgerCaptureStatus(row),
        captureResult: getLedgerCaptureResult(row),
      })

      if (!result.success) {
        updateRow(row.id, { status: result.message })
        return
      }

      const followUp = buildFollowUpMessage(row)
      setRows((current) => ensureTrailingBlankRow(current.map((item) => (item.id === row.id ? createBlankRow({ status: `${result.message}${followUp}` }) : item))))
      router.refresh()
    })
  }

  return (
    <section id="ledger-capture" className={`rounded-3xl border bg-white/[0.05] p-4 shadow-2xl transition xl:p-5 ${isFocusedEntry ? 'border-orange-300/45 shadow-[0_0_0_1px_rgba(251,146,60,0.18),0_0_28px_rgba(251,146,60,0.12)]' : 'border-orange-300/18'}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <span className="inline-flex rounded-full border border-orange-300/30 bg-orange-400/12 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-orange-100">
            Ledger
          </span>
          <h2 className="mt-3 text-2xl font-semibold text-orange-50">Trades</h2>
          <p className="mt-1 text-sm text-white/45">Zeile füllen, speichern, später ergänzen oder schließen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/trades?capture=import#trade-editor" className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:text-white">CSV</Link>
          <Link href="/trades?capture=quick#trade-editor" className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:text-white">Screenshot</Link>
          <Link href="/trades?capture=full#trade-editor" className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:text-white">Vollständig</Link>
          <button
            type="button"
            onClick={addRow}
            className="rounded-2xl border border-orange-300/25 bg-orange-400/10 px-4 py-2.5 text-sm font-medium text-white transition hover:border-orange-300/40 hover:bg-orange-400/15"
          >
            + Zeile
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="border-b border-white/10 bg-black/40 text-left text-[11px] uppercase tracking-[0.18em] text-orange-100/60">
            <tr>
              {['Zeit', 'Markt', 'Richtung', 'Entry', 'Exit', 'Stop', 'Size', 'P&L', 'Setup', 'Emotion', 'Aktion'].map((label) => (
                <th key={label} className="px-3 py-3 font-medium whitespace-nowrap">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-3 py-3">
                  <input
                    type="datetime-local"
                    value={row.tradeOccurredAt}
                    onChange={(event) => updateRow(row.id, { tradeOccurredAt: event.target.value, status: '' })}
                    className="w-[180px] rounded-xl border border-orange-300/15 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-orange-300/35"
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    list="ledger-markets"
                    value={row.market}
                    onChange={(event) => updateRow(row.id, { market: event.target.value, status: '' })}
                    placeholder="BTCUSDT"
                    className="w-[150px] rounded-xl border border-orange-300/15 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-orange-300/35"
                  />
                </td>
                <td className="px-3 py-3">
                  <select
                    value={row.direction}
                    onChange={(event) => updateRow(row.id, { direction: event.target.value as LedgerRow['direction'], status: '' })}
                    className="w-[110px] rounded-xl border border-orange-300/15 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-orange-300/35"
                  >
                    <option value="" className="bg-black text-white">Offen</option>
                    <option value="Long" className="bg-black text-white">Long</option>
                    <option value="Short" className="bg-black text-white">Short</option>
                  </select>
                </td>
                {(['entry', 'exit', 'stopLoss', 'positionSize'] as const).map((field) => (
                  <td key={field} className="px-3 py-3">
                    <input
                      value={row[field]}
                      onChange={(event) => updateRow(row.id, { [field]: event.target.value, status: '' })}
                      placeholder={field === 'positionSize' ? '0.10' : '0.00'}
                      className="w-[110px] rounded-xl border border-orange-300/15 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-orange-300/35"
                    />
                  </td>
                ))}
                <td className="px-3 py-3">
                  <div className={`w-[160px] rounded-xl border px-3 py-2 text-sm ${getLedgerQuickTone(row) === 'positive' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : getLedgerQuickTone(row) === 'negative' ? 'border-red-400/20 bg-red-400/10 text-red-100' : getLedgerQuickTone(row) === 'flat' ? 'border-white/15 bg-white/5 text-white/70' : 'border-white/10 bg-black/20 text-white/40'}`}>
                    {getLedgerQuickPnLLabel(row)}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <input
                    list="ledger-setups"
                    value={row.setup}
                    onChange={(event) => updateRow(row.id, { setup: event.target.value, status: '' })}
                    placeholder="Setup"
                    className="w-[150px] rounded-xl border border-orange-300/15 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-orange-300/35"
                  />
                </td>
                <td className="px-3 py-3">
                  <input
                    list="ledger-emotions"
                    value={row.emotion}
                    onChange={(event) => updateRow(row.id, { emotion: event.target.value, status: '' })}
                    placeholder="Ruhig"
                    className="w-[140px] rounded-xl border border-orange-300/15 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-orange-300/35"
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => saveRow(row)}
                      className="rounded-xl border border-orange-300/25 bg-orange-400/10 px-3 py-2 text-sm text-white transition hover:border-orange-300/40 hover:bg-orange-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? 'Speichert ...' : 'Speichern'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/55 transition hover:border-white/20 hover:text-white"
                    >
                      Entfernen
                    </button>
                    {row.status ? <p className="max-w-[220px] text-xs leading-5 text-white/55">{row.status}</p> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <datalist id="ledger-markets">
        {knownMarkets.map((market) => (
          <option key={market} value={market} />
        ))}
      </datalist>
      <datalist id="ledger-setups">
        {knownSetups.map((setup) => (
          <option key={setup} value={setup} />
        ))}
      </datalist>
      <datalist id="ledger-emotions">
        {knownEmotions.map((emotion) => (
          <option key={emotion} value={emotion} />
        ))}
      </datalist>
    </section>
  )
}
