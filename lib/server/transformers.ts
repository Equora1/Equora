import { journalNumberLocale, journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { DailyNoteRow, TradeMediaRow, TradeRow } from '@/lib/types/db'
import type { LinkedSetupReference } from '@/lib/utils/trade-setup-links'
import type { Trade, TradeDetail } from '@/lib/types/trade'
import { formatTradeDateLabel } from '@/lib/utils/date-format'
import { deriveTradeKillZoneLabel, deriveTradeSessionLabel, formatTradeTimeLabel, resolveTradeOccurredAtFromRow } from '@/lib/utils/trade-time'
import { buildTradeImportSourceFacts, extractTradeImportMeta } from '@/lib/utils/trade-import-meta'
import { getTradeAccountLabel } from '@/lib/utils/account-context'
import { getTradeCurrencyStatus } from '@/lib/utils/currency'
import { formatTradeRValue } from '@/lib/utils/trade-r'
import { WEIGHTED_EXIT_PRICE_BASIS } from '@/lib/utils/trade-exit-basis'
import {
  getTradeCaptureResultLabel,
  getTradeCaptureStatusLabel,
  getTradeCaptureTrustLabel,
  inferTradeCaptureResultFromPnL,
  normalizeTradeCaptureResult,
  normalizeTradeCaptureStatus,
} from '@/lib/utils/trade-capture'
import {
  computeTradeMetrics,
  formatCurrency,
  formatPartialExitCoverageLabel,
  formatPartialExitRealizedLabel,
  formatPartialExitRemainingLabel,
  formatPlainNumber,
  formatPartialExitSummary,
  formatRMultiple,
  getPartialExitPlanInfo,
  getPartialExitSizePlan,
  parseTradingNumber,
  getAccountTemplateLabel,
  getBrokerProfileLabel,
  getCostProfileLabel,
  getCryptoMarketTypeLabel,
  getExecutionTypeLabel,
  getFundingDirectionLabel,
  getInstrumentLabel,
  getMarketTemplateLabel,
  getPnLModeLabel,
} from '@/lib/utils/calculations'

function getTradeScreenshotUrls(row: TradeRow, mediaRows: TradeMediaRow[] = []) {
  const mediaUrls = mediaRows.map((media) => media.public_url).filter(Boolean)
  const fallback = row.screenshot_url ? [row.screenshot_url] : []
  return mediaUrls.length ? mediaUrls : fallback
}

// Existing rows do not identify whether exit is a remainder price or a weighted average.
// Keep explicit manual P&L, but do not promote an ambiguous execution calculation to a result.
function guardStoredPartialExit(metrics: ReturnType<typeof computeTradeMetrics>, row: TradeRow) {
  const plan = getPartialExitPlanInfo({ exit: row.exit, partialExits: row.partial_exits ?? [] })
  const ambiguous = plan.count > 0 && plan.hasRemainder && parseTradingNumber(row.exit) !== null
    && row.exit_price_basis !== WEIGHTED_EXIT_PRICE_BASIS
  if (ambiguous) {
    metrics.rValue = null
    metrics.rSource = 'missing'
    metrics.autoNetPnL = null
    metrics.grossPnL = null
    if (metrics.priceRisk === null || metrics.positionSize === null || metrics.positionSize <= 0
      || (['futures', 'forex', 'cfd'].includes(metrics.instrumentType) && metrics.pointValue === null)) {
      metrics.riskAmount = null
    }
    if (metrics.pnlSource === 'derived') {
      metrics.netPnL = null
      metrics.pnlSource = 'missing'
    }
  }
  return ambiguous
}

export function mapTradeRowToTrade(row: TradeRow, mediaRows: TradeMediaRow[] = [], linkedSetup: LinkedSetupReference | null = null): Trade {
  const partialExits = Array.isArray(row.partial_exits) ? row.partial_exits : null
  const metrics = computeTradeMetrics({
    pnl: row.net_pnl,
    pnlMode: row.pnl_mode,
    costProfile: row.cost_profile,
    brokerProfile: row.broker_profile,
    rMultiple: row.r_multiple,
    entry: row.entry,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    exit: row.exit,
    bias: row.bias,
    instrumentType: row.instrument_type,
    positionSize: row.position_size,
    pointValue: row.point_value,
    fees: row.fees,
    exchangeFees: row.exchange_fees,
    fundingFees: row.funding_fees,
    spreadCost: row.spread_cost,
    slippage: row.slippage,
    accountCurrency: row.account_currency,
    riskPercent: row.risk_percent,
    accountSize: row.account_size,
    cryptoMarketType: row.crypto_market_type,
    executionType: row.execution_type,
    fundingDirection: row.funding_direction,
    fundingRateBps: row.funding_rate_bps,
    fundingIntervals: row.funding_intervals,
    quoteAsset: row.quote_asset,
    leverage: row.leverage,
    partialExits: partialExits ?? [],
  })

  const ambiguousPartialExit = guardStoredPartialExit(metrics, row)
  const captureStatus = normalizeTradeCaptureStatus(row.capture_status)
  const captureResult = normalizeTradeCaptureResult(row.capture_result) ?? inferTradeCaptureResultFromPnL(metrics.netPnL)

  const screenshotUrls = getTradeScreenshotUrls(row, mediaRows)
  const importMeta = extractTradeImportMeta(row.notes)

  const partialPlan = getPartialExitPlanInfo({ exit: row.exit, partialExits: partialExits ?? [] })
  const partialSizePlan = getPartialExitSizePlan({ positionSize: metrics.positionSize, partialExits: partialExits ?? [], exit: row.exit })
  const tradeOccurredAt = resolveTradeOccurredAtFromRow(row)
  const resolvedSession = row.session?.trim() || deriveTradeSessionLabel(tradeOccurredAt)
  const resolvedKillZone = deriveTradeKillZoneLabel(tradeOccurredAt)

  return {
    id: row.id,
    date: formatTradeDateLabel(tradeOccurredAt),
    createdAt: row.created_at,
    tradeOccurredAt,
    market: row.market,
    setup: linkedSetup?.title ?? row.setup,
    ruleCheck: row.rule_check ?? '—',
    reviewRepeatability: row.review_repeatability ?? '—',
    reviewState: row.review_state ?? '—',
    reviewLesson: row.review_lesson ?? '—',
    result: metrics.netPnL !== null ? formatCurrency(metrics.netPnL, 0, row.account_currency) : captureResult ? getTradeCaptureResultLabel(captureResult) : '—',
    r: ambiguousPartialExit ? 'R-Zuordnung prüfen' : formatTradeRValue(metrics.rValue, metrics.rSource),
    emotion: row.emotion ?? '—',
    quality: (row.quality ?? 'B-Setup') as Trade['quality'],
    session: resolvedSession,
    killZone: resolvedKillZone,
    concept: row.concept ?? '—',
    netPnL: metrics.netPnL ?? undefined,
    grossPnL: metrics.grossPnL,
    totalCosts: metrics.totalCosts,
    rValue: metrics.rValue,
    priceRisk: metrics.priceRisk,
    plannedReward: metrics.plannedReward,
    riskRewardRatio: metrics.riskRewardRatio,
    riskAmount: metrics.riskAmount,
    riskPercent: metrics.riskPercent,
    plannedRiskAmount: metrics.plannedRiskAmount,
    actualRiskPercent: metrics.actualRiskPercent,
    exposure: metrics.exposure,
    marginUsed: metrics.marginUsed,
    accountSize: metrics.accountSize,
    partialExits,
    partialExitCoveragePercent: partialPlan.count ? partialPlan.coveredPercent : null,
    partialExitRemainderPercent: partialPlan.count ? partialPlan.remainderPercent : null,
    partialExitRealizedSize: partialPlan.count ? partialSizePlan.realizedSize : null,
    partialExitRemainingSize: partialPlan.count ? partialSizePlan.remainingSize : null,
    partialExitHasOpenRemainder: partialPlan.hasOpenRemainder,
    effectiveExit: parseTradingNumber(row.exit) ?? partialPlan.effectiveExit,
    direction: metrics.direction,
    rSource: metrics.rSource,
    pnlSource: metrics.pnlSource,
    pnlMode: metrics.pnlMode,
    costProfile: metrics.costProfile,
    brokerProfile: metrics.brokerProfile,
    accountTemplate: (row.account_template ?? 'manual') as Trade['accountTemplate'],
    accountLabel: row.account_label ?? null,
    marketTemplate: (row.market_template ?? 'manual') as Trade['marketTemplate'],
    accountCurrency: metrics.accountCurrency,
    accountCurrencyStatus: getTradeCurrencyStatus(row.account_currency),
    positionSize: metrics.positionSize,
    pointValue: metrics.pointValue,
    fees: metrics.fees,
    exchangeFees: metrics.exchangeFees,
    fundingFees: metrics.fundingFees,
    spreadCost: metrics.spreadCost,
    slippage: metrics.slippage,
    autoNetPnL: metrics.autoNetPnL,
    instrumentType: metrics.instrumentType,
    cryptoMarketType: metrics.cryptoMarketType,
    executionType: metrics.executionType,
    fundingDirection: metrics.fundingDirection,
    fundingRateBps: metrics.fundingRateBps,
    fundingIntervals: metrics.fundingIntervals,
    quoteAsset: metrics.quoteAsset,
    leverage: metrics.leverage,
    userCostProfileId: row.user_cost_profile_id ?? null,
    userCostProfileLabel: row.user_cost_profile_id ? 'Eigenes Kostenprofil' : null,
    captureStatus,
    captureResult,
    capturedAt: tradeOccurredAt,
    completedAt: row.completed_at ?? null,
    isComplete: captureStatus === 'complete',
    screenshotUrl: screenshotUrls[0],
    screenshotUrls,
    screenshotCount: screenshotUrls.length,
    importPresetLabel: importMeta.meta?.presetLabel ?? undefined,
    hasImportMeta: Boolean(importMeta.meta),
    importTrustScore: importMeta.meta?.trustScore ?? null,
    importTrustLabel: importMeta.meta?.trustLabel ?? null,
    importWarnings: importMeta.meta?.warnings?.filter(Boolean) ?? [],
  }
}

export function mapTradeRowToTradeDetail(
  row: TradeRow,
  mediaRows: TradeMediaRow[] = [],
  linkedSetup: LinkedSetupReference | null = null,
  locale: JournalLocale = 'de',
): TradeDetail {
  const text = journalText(locale)
  // Keep the stored unit for display: normalization must not hide unsupported currencies.
  const displayCurrency = row.account_currency
  const money = (value: number, digits = 0) => formatCurrency(value, digits, displayCurrency, locale)
  const number = (value: number, digits = 2) => formatPlainNumber(value, digits, locale)
  const partialExits = Array.isArray(row.partial_exits) ? row.partial_exits : []
  const metrics = computeTradeMetrics({
    pnl: row.net_pnl,
    pnlMode: row.pnl_mode,
    costProfile: row.cost_profile,
    brokerProfile: row.broker_profile,
    rMultiple: row.r_multiple,
    entry: row.entry,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    exit: row.exit,
    bias: row.bias,
    instrumentType: row.instrument_type,
    positionSize: row.position_size,
    pointValue: row.point_value,
    fees: row.fees,
    exchangeFees: row.exchange_fees,
    fundingFees: row.funding_fees,
    spreadCost: row.spread_cost,
    slippage: row.slippage,
    accountCurrency: row.account_currency,
    riskPercent: row.risk_percent,
    accountSize: row.account_size,
    cryptoMarketType: row.crypto_market_type,
    executionType: row.execution_type,
    fundingDirection: row.funding_direction,
    fundingRateBps: row.funding_rate_bps,
    fundingIntervals: row.funding_intervals,
    quoteAsset: row.quote_asset,
    leverage: row.leverage,
    partialExits,
  })

  const ambiguousPartialExit = guardStoredPartialExit(metrics, row)
  const captureStatus = normalizeTradeCaptureStatus(row.capture_status)
  const captureResult = normalizeTradeCaptureResult(row.capture_result) ?? inferTradeCaptureResultFromPnL(metrics.netPnL)

  const costProfile = getCostProfileLabel(metrics.costProfile, locale)
  const brokerProfile = getBrokerProfileLabel(metrics.brokerProfile, locale)
  const costParts = [
    `${costProfile} ${text('Profil', 'profile')}`,
    `Broker ${brokerProfile}`,
    metrics.fees !== null ? `${text('Kommission', 'Commission')} ${money(metrics.fees)}` : null,
    metrics.exchangeFees !== null ? `${text('Börse', 'Exchange fees')} ${money(metrics.exchangeFees)}` : null,
    metrics.fundingFees !== null ? `Funding ${money(metrics.fundingFees)}` : null,
    metrics.fundingRateBps !== null ? `${text('Funding-Rate', 'Funding rate')} ${number(metrics.fundingRateBps, 2)} bps` : null,
    metrics.spreadCost !== null ? `Spread ${money(metrics.spreadCost)}` : null,
    metrics.slippage !== null ? `Slippage ${money(metrics.slippage)}` : null,
    `${text('Gesamt', 'Total')} ${money(metrics.totalCosts || 0)}`,
  ].filter(Boolean)

  const sizeParts = [
    metrics.positionSize !== null ? `${text('Menge', 'Quantity')} ${number(metrics.positionSize, 2)}` : null,
    metrics.pointValue !== null ? `${text('Punktwert', 'Point value')} ${number(metrics.pointValue, 2)}` : null,
    metrics.quoteAsset ? `Quote ${metrics.quoteAsset}` : null,
  ].filter(Boolean)

  const marginParts = [
    metrics.marginUsed !== null ? `Margin ${money(metrics.marginUsed, 2)}` : null,
    metrics.leverage !== null ? `${text('Hebel', 'Leverage')} ${number(metrics.leverage, 2)}x` : null,
    metrics.exposure !== null ? `${text('Positionswert', 'Position value')} ${money(metrics.exposure, 2)}` : null,
    metrics.accountSize !== null ? `${text('Konto', 'Account')} ${money(metrics.accountSize, 2)}` : null,
  ].filter(Boolean)

  const screenshotUrls = getTradeScreenshotUrls(row, mediaRows)
  const partialPlan = getPartialExitPlanInfo({ exit: row.exit, partialExits })
  const importMeta = extractTradeImportMeta(row.notes)
  const tradeOccurredAt = resolveTradeOccurredAtFromRow(row)
  const resolvedSession = row.session?.trim() || deriveTradeSessionLabel(tradeOccurredAt)
  const resolvedKillZone = deriveTradeKillZoneLabel(tradeOccurredAt)
  const partialSizePlan = getPartialExitSizePlan({ positionSize: metrics.positionSize, partialExits, exit: row.exit })
  const partialExitsLabel = partialPlan.count ? formatPartialExitSummary(partialExits, locale) : null
  const hasOpenRemainder = partialPlan.hasOpenRemainder
  const recordedExit = parseTradingNumber(row.exit)

  return {
    title: `${row.market} ${linkedSetup?.title ?? row.setup}`,
    date: `${formatTradeDateLabel(tradeOccurredAt, locale)}${resolvedSession ? ` · ${resolvedSession}` : ''}`,
    result: ambiguousPartialExit ? text('R-Zuordnung prüfen', 'Check how R was determined') : formatTradeRValue(metrics.rValue, metrics.rSource, locale),
    pnl:
      metrics.netPnL !== null
        ? `${money(metrics.netPnL)}${hasOpenRemainder ? text(' bisher realisiert · Restposition offen', ' realised so far · remaining position open') : ''}`
        : ambiguousPartialExit
          ? text('Ergebniszuordnung prüfen', 'Check how the result was determined')
          : text('Kein P&L hinterlegt', 'No P&L recorded'),
    emotion: row.emotion ?? '—',
    setup: linkedSetup?.title ?? row.setup,
    quality: (row.quality ?? 'B-Setup') as TradeDetail['quality'],
    ruleCheck: row.rule_check ?? '—',
    lesson: importMeta.cleanNotes || (captureStatus === 'incomplete' ? text('Schnellerfassung gespeichert. Ergänze später Entry, Exit, Größe und belastbare P&L.', 'Quick entry saved. Add the entry, exit, size and P&L later.') : text('Noch keine Notiz hinterlegt.', 'No note recorded yet.')),
    reviewRepeatability: row.review_repeatability ?? '—',
    reviewState: row.review_state ?? '—',
    reviewLesson: row.review_lesson ?? '—',
    screenshotUrl: screenshotUrls[0] ?? undefined,
    screenshotUrls,
    screenshotItems: mediaRows
      .filter((media) => Boolean(media.public_url))
      .map((media) => ({ id: media.id, url: media.public_url })),
    screenshotCount: screenshotUrls.length,
    direction:
      metrics.direction === 'long'
        ? 'Long'
        : metrics.direction === 'short'
          ? 'Short'
          : 'Neutral',
    riskReward:
      metrics.riskRewardRatio !== null ? `${number(metrics.riskRewardRatio)} : 1 ${text('geplant', 'planned')}` : text('Kein sauberes CRV ableitbar', 'Risk/reward ratio unavailable'),
    riskAmount:
      metrics.riskAmount !== null ? money(metrics.riskAmount) : text('Nicht sicher berechenbar', 'Cannot be calculated reliably'),
    riskPlanLabel:
      metrics.riskPercent !== null
        ? `${number(metrics.riskPercent, 2)}% ${text('geplant', 'planned')}${metrics.plannedRiskAmount !== null ? ` · ${money(metrics.plannedRiskAmount)}` : ''}`
        : metrics.accountSize !== null
          ? text('Kontogröße da, aber noch kein geplantes Risiko gesetzt', 'Account size is available. Planned risk is missing.')
          : text('Kontogröße optional. Mit Konto + Risiko % wird der Plan sichtbar', 'Add account size and risk percentage to see the planned risk.'),
    accountRiskLabel:
      metrics.actualRiskPercent !== null
        ? `${number(metrics.actualRiskPercent, 2)}% ${text('vom Konto', 'of account value')}`
        : metrics.accountSize !== null
          ? text('Kontogröße da, aber Stop-Risiko noch nicht sauber ableitbar', 'Account size is available. Stop risk cannot be calculated yet.')
          : text('Ohne Kontogröße bleibt nur das absolute Stop-Risiko sichtbar', 'Add account size to see stop risk as a percentage.'),
    priceRisk:
      metrics.priceRisk !== null ? number(metrics.priceRisk, 4) : text('Nicht ableitbar', 'Unavailable'),
    rSourceLabel:
      metrics.rSource === 'manual'
        ? text('R manuell hinterlegt', 'R entered manually')
        : metrics.rSource === 'realized_partial'
          ? text('R aus bereits realisiertem P&L und initialem Stop-Risiko abgeleitet', 'R calculated from P&L realised so far and initial stop risk')
          : metrics.rSource === 'realized'
            ? text('R aus realisiertem P&L und initialem Stop-Risiko abgeleitet', 'R calculated from realised P&L and initial stop risk')
            : metrics.rSource === 'planned'
              ? text('R aus TP grob abgeleitet', 'Estimated R based on take profit')
              : text('Kein R-Wert vorhanden', 'No R value available'),
    pnlSourceLabel:
      ambiguousPartialExit
        ? text('Bei diesen Teilverkäufen ist die Art des gespeicherten Ausstiegspreises nicht nachweisbar. Automatische Abschlusswerte und R werden deshalb nicht ausgewertet. Ein manuell hinterlegtes Ergebnis bleibt sichtbar. Prüfe die Preise über „Bearbeiten“ anhand deiner Unterlagen.', 'The recorded exit price type for these partial exits is unclear. Automatic closing P&L and R are unavailable. Manually entered P&L is still shown. Use Edit to check the prices against your records.')
        : captureStatus === 'incomplete'
        ? text('Schnellerfassung ohne belastbare P&L. Öffne „Bearbeiten“, um die Angaben zu ergänzen.', 'Quick entry without reliable P&L. Use Edit to complete the trade.')
        : metrics.pnlSource === 'manual'
          ? text('P&L manuell hinterlegt', 'P&L entered manually')
          : metrics.pnlSource === 'override'
            ? text(
              `Auto-Netto ${metrics.autoNetPnL !== null ? money(metrics.autoNetPnL) : '—'} wurde manuell überschrieben`,
              `Automatic net P&L (${metrics.autoNetPnL !== null ? money(metrics.autoNetPnL) : '—'}) was overridden manually.`,
            )
            : metrics.pnlSource === 'derived'
              ? hasOpenRemainder
                ? text('P&L bisher aus erfassten Teilverkäufen, Positionsgröße und Kosten berechnet', 'P&L so far is calculated from recorded partial exits, position size and costs')
                : text('P&L aus Einstieg, Ausstieg, Positionsgröße und Kosten berechnet', 'P&L calculated from entry, exit, position size and costs')
              : text('P&L noch nicht belastbar berechenbar', 'P&L cannot be calculated reliably yet'),
    pnlModeLabel: getPnLModeLabel(metrics.pnlMode, locale),
    instrumentLabel: getInstrumentLabel(metrics.instrumentType, locale),
    costLabel: costParts.join(' · '),
    costProfileLabel: `${text('Kostenprofil', 'Cost profile')}: ${costProfile}`,
    brokerProfileLabel: `${text('Brokerprofil', 'Broker profile')}: ${brokerProfile}`,
    accountTemplateLabel: `${text('Kontovorlage', 'Account template')}: ${getAccountTemplateLabel(row.account_template, locale)}`,
    accountLabel: getTradeAccountLabel({ accountLabel: row.account_label, accountTemplate: (row.account_template ?? 'manual') as Trade['accountTemplate'] }, locale),
    marketTemplateLabel: `${text('Marktvorlage', 'Market template')}: ${getMarketTemplateLabel(row.market_template, locale)}`,
    userCostProfileLabel: row.user_cost_profile_id ? text('Eigenes Nutzer-Kostenprofil aktiv', 'Custom cost profile in use') : undefined,
    sizeLabel: sizeParts.length ? sizeParts.join(' · ') : text('Keine Positionsgröße oder Punktwertangabe hinterlegt', 'Position size and point value are missing'),
    marginLabel: marginParts.length ? marginParts.join(' · ') : text('Noch keine Margin-/Hebelbasis hinterlegt', 'Margin and leverage are missing'),
    partialExitsLabel: partialExitsLabel ?? undefined,
    partialExitCoverageLabel: partialPlan.count ? formatPartialExitCoverageLabel(partialPlan.coveredPercent, partialPlan.remainderPercent, hasOpenRemainder, locale) : undefined,
    partialExitRealizedLabel: partialPlan.count ? formatPartialExitRealizedLabel(partialPlan.coveredPercent, partialSizePlan.realizedSize, locale) : undefined,
    partialExitRemainingLabel: partialPlan.count ? (hasOpenRemainder ? formatPartialExitRemainingLabel(partialPlan.remainderPercent, partialSizePlan.remainingSize, locale) : text('Keine offene Restposition', 'No remaining open position')) : undefined,
    partialExitStateLabel: partialPlan.count ? (hasOpenRemainder ? text('Teilverkäufe erfasst · Restposition offen', 'Partial exits recorded · remaining position open') : text('Position vollständig geschlossen', 'Position fully closed')) : undefined,
    effectiveExitLabel: recordedExit !== null
      ? `${number(recordedExit, 4)} ${text('gespeicherter Exit', 'recorded exit price')}`
      : partialPlan.effectiveExit !== null
        ? `${number(partialPlan.effectiveExit, 4)} ${text('aus Teilverkäufen berechnet', 'calculated from partial exits')}`
        : undefined,
    executionLabel: metrics.grossPnL !== null ? `${text('Brutto', 'Gross')} ${money(metrics.grossPnL)} → ${text('Netto', 'Net')} ${metrics.netPnL !== null ? money(metrics.netPnL) : '—'}${metrics.pnlSource === 'override' && metrics.autoNetPnL !== null ? ` (Auto ${money(metrics.autoNetPnL)})` : ''} · ${getExecutionTypeLabel(metrics.executionType, locale)} · ${getFundingDirectionLabel(metrics.fundingDirection, locale)}` : text('Keine belastbare Ausführungsrechnung möglich', 'Execution P&L cannot be calculated reliably'),
    cryptoLabel: metrics.instrumentType === 'crypto' ? `${text('Krypto-Modus', 'Crypto mode')}: ${getCryptoMarketTypeLabel(metrics.cryptoMarketType, locale)}${metrics.quoteAsset ? ` · Quote ${metrics.quoteAsset}` : ''}${metrics.leverage !== null ? ` · ${text('Hebel', 'Leverage')} ${number(metrics.leverage, 2)}x` : ''}${metrics.executionType ? ` · ${getExecutionTypeLabel(metrics.executionType, locale)}` : ''}${metrics.fundingDirection ? ` · ${getFundingDirectionLabel(metrics.fundingDirection, locale)}` : ''}` : undefined,
    captureStatusLabel: getTradeCaptureStatusLabel(captureStatus, locale),
    sessionLabel: resolvedSession,
    killZoneLabel: resolvedKillZone === 'Kein Kernfenster' ? text('Kein Kernfenster', 'Outside key sessions') : resolvedKillZone,
    tradeTimeLabel: formatTradeTimeLabel(tradeOccurredAt, journalNumberLocale[locale]),
    captureTrustLabel: getTradeCaptureTrustLabel(captureStatus, metrics.netPnL !== null, locale),
    captureResultLabel: captureResult ? getTradeCaptureResultLabel(captureResult, locale) : undefined,
    importPresetLabel: importMeta.meta?.presetLabel ?? undefined,
    importFieldSourceFacts: buildTradeImportSourceFacts(importMeta.meta, locale),
  }
}

export function mapDailyNoteRowToCalendarNote(row: DailyNoteRow) {
  return {
    id: row.id,
    dateKey: row.trade_date,
    title: row.title ?? 'Review-Notiz',
    note: row.note ?? 'Noch keine Review-Notiz vorhanden.',
    mood: row.mood ?? '—',
    focus: row.focus ?? '—',
  }
}
