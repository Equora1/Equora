'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { getDateKeyFromDate } from '@/lib/utils/calendar'
import { inferTradeCaptureResultFromPnL } from '@/lib/utils/trade-capture'
import { normalizeInstrumentType, parseTradingNumber } from '@/lib/utils/calculations'
import type { CsvImportDraft } from '@/lib/utils/trade-import'

export type CsvTradeImportInput = {
  rows: CsvImportDraft[]
}

function toNumericField(value: string | null | undefined) {
  return value?.trim() ? parseTradingNumber(value) : null
}

function revalidateTradeSurfaces() {
  revalidatePath('/dashboard')
  revalidatePath('/trades')
  revalidatePath('/statistik')
  revalidatePath('/kalender')
  revalidatePath('/review')
  revalidatePath('/setups')
}

function buildTradeFingerprint(input: {
  createdAt: string
  market: string
  bias?: string | null
  netPnL?: number | null
  positionSize?: number | null
}) {
  const date = new Date(input.createdAt)
  const dateKey = Number.isNaN(date.getTime()) ? input.createdAt.slice(0, 10) : getDateKeyFromDate(date)
  return [
    dateKey,
    input.market.trim().toLowerCase(),
    (input.bias ?? '').trim().toLowerCase(),
    input.netPnL ?? '',
    input.positionSize ?? '',
  ].join('|')
}

export async function importTradeCsvEntries(input: CsvTradeImportInput) {
  const rows = input.rows.filter((row) => row.date?.trim() && row.market?.trim())

  if (!rows.length) {
    return {
      success: false,
      mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
      message: 'Keine importierbaren Zeilen gefunden.',
    }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      mode: 'demo' as const,
      importedCount: rows.length,
      duplicateCount: 0,
      skippedCount: 0,
      importedIds: rows.slice(0, 12).map((_, index) => `demo-import-${index + 1}`),
      message: `${rows.length} Trades als Demo-Import vorbereitet.`,
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, mode: 'supabase' as const, message: 'Bitte zuerst einloggen.' }
    }

    const { data: existingTrades, error: existingTradesError } = await supabase
      .from('trades')
      .select('id, created_at, market, bias, net_pnl, position_size')
      .eq('user_id', user.id)

    if (existingTradesError) {
      return { success: false, mode: 'supabase' as const, message: `Bestehende Trades konnten nicht geprüft werden. ${existingTradesError.message}` }
    }

    const existingFingerprints = new Set(
      (existingTrades ?? []).map((trade) =>
        buildTradeFingerprint({
          createdAt: trade.created_at,
          market: trade.market,
          bias: trade.bias,
          netPnL: typeof trade.net_pnl === 'number' ? trade.net_pnl : parseTradingNumber(trade.net_pnl),
          positionSize: typeof trade.position_size === 'number' ? trade.position_size : parseTradingNumber(trade.position_size),
        }),
      ),
    )

    const stagedTrades: Record<string, unknown>[] = []
    const stagedTags: Record<string, unknown>[] = []
    const importedIds: string[] = []
    const seenFingerprints = new Set<string>()
    let duplicateCount = 0
    let skippedCount = 0

    for (const row of rows) {
      const normalizedDate = new Date(row.date)
      if (Number.isNaN(normalizedDate.getTime()) || !row.market.trim()) {
        skippedCount += 1
        continue
      }

      const tradeId = crypto.randomUUID()
      const timestamp = normalizedDate.toISOString()
      const netPnL = toNumericField(row.netPnL)
      const positionSize = toNumericField(row.positionSize)
      const bias = row.direction?.trim() || null
      const fingerprint = buildTradeFingerprint({
        createdAt: timestamp,
        market: row.market,
        bias,
        netPnL,
        positionSize,
      })

      if (existingFingerprints.has(fingerprint) || seenFingerprints.has(fingerprint)) {
        duplicateCount += 1
        continue
      }

      seenFingerprints.add(fingerprint)
      importedIds.push(tradeId)

      const entry = toNumericField(row.entry)
      const exit = toNumericField(row.exit)
      const stopLoss = toNumericField(row.stopLoss)
      const takeProfit = toNumericField(row.takeProfit)
      const fees = toNumericField(row.fees)
      const hasEnoughContext = netPnL !== null || (entry !== null && exit !== null) || (entry !== null && stopLoss !== null && takeProfit !== null)
      const inferredResult = inferTradeCaptureResultFromPnL(netPnL)
      const captureStatus = hasEnoughContext ? 'complete' : 'incomplete'
      const captureResult = inferredResult ?? (captureStatus === 'incomplete' && entry !== null && exit === null ? 'open' : null)
      const tags = Array.from(new Set((row.tags ?? []).map((tag) => tag.trim()).filter(Boolean)))
      const noteParts = ['Importiert aus CSV', row.notes?.trim()].filter(Boolean)
      const instrumentType = normalizeInstrumentType(row.instrumentType || 'unknown')

      stagedTrades.push({
        id: tradeId,
        user_id: user.id,
        created_at: timestamp,
        market: row.market.trim(),
        setup: row.setup?.trim() || 'CSV Import',
        emotion: null,
        bias,
        rule_check: null,
        entry,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        exit,
        net_pnl: netPnL,
        risk_percent: null,
        r_multiple: null,
        pnl_mode: 'manual',
        cost_profile: 'manual',
        broker_profile: 'manual',
        instrument_type: instrumentType,
        account_template: 'manual',
        market_template: 'manual',
        position_size: positionSize,
        point_value: null,
        fees,
        exchange_fees: null,
        funding_fees: null,
        funding_rate_bps: null,
        funding_intervals: null,
        spread_cost: null,
        slippage: null,
        account_currency: null,
        crypto_market_type: 'manual',
        execution_type: 'manual',
        funding_direction: 'manual',
        quote_asset: null,
        leverage: null,
        user_cost_profile_id: null,
        capture_status: captureStatus,
        capture_result: captureResult,
        captured_at: timestamp,
        completed_at: captureStatus === 'complete' ? timestamp : null,
        notes: noteParts.join('\n\n') || null,
        screenshot_url: null,
        quality: tags.includes('A-Setup') ? 'A-Setup' : tags.includes('C-Setup') ? 'C-Setup' : 'B-Setup',
        session: row.session?.trim() || null,
        concept: null,
      })

      if (tags.length) {
        stagedTags.push(
          ...tags.map((tag) => ({
            id: crypto.randomUUID(),
            trade_id: tradeId,
            tag,
            created_at: timestamp,
          })),
        )
      }
    }

    if (!stagedTrades.length) {
      return {
        success: false,
        mode: 'supabase' as const,
        importedCount: 0,
        duplicateCount,
        skippedCount,
        importedIds: [],
        message: duplicateCount ? 'Alle Zeilen wurden als mögliche Dubletten erkannt.' : 'Keine Trades konnten importiert werden.',
      }
    }

    const { error: importError } = await supabase.from('trades').insert(stagedTrades)
    if (importError) {
      return { success: false, mode: 'supabase' as const, message: `CSV-Import fehlgeschlagen. ${importError.message}` }
    }

    if (stagedTags.length) {
      const { error: tagError } = await supabase.from('trade_tags').insert(stagedTags)
      if (tagError) {
        return { success: false, mode: 'supabase' as const, message: `Trades wurden importiert, aber Tags nicht vollständig gespeichert. ${tagError.message}` }
      }
    }

    revalidateTradeSurfaces()

    const importedCount = stagedTrades.length
    const summaryParts = [`${importedCount} Trade${importedCount === 1 ? '' : 's'} importiert`]
    if (duplicateCount) summaryParts.push(`${duplicateCount} Dublette${duplicateCount === 1 ? '' : 'n'} übersprungen`)
    if (skippedCount) summaryParts.push(`${skippedCount} Zeile${skippedCount === 1 ? '' : 'n'} ausgelassen`)

    return {
      success: true,
      mode: 'supabase' as const,
      importedCount,
      duplicateCount,
      skippedCount,
      importedIds: importedIds.slice(0, 24),
      message: `${summaryParts.join(' · ')}.`,
    }
  } catch (error) {
    return { success: false, mode: 'supabase' as const, message: `CSV-Import fehlgeschlagen. ${error instanceof Error ? error.message : 'Unbekannter Fehler.'}` }
  }
}
