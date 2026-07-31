import type { DailyNoteRow, TradeMediaRow, TradeRow } from '@/lib/types/db'
import type { LinkedSetupReference } from '@/lib/utils/trade-setup-links'
import type { Trade, TradeDetail } from '@/lib/types/trade'
import { formatTradeDateLabel } from '@/lib/utils/date-format'
import { deriveTradeKillZoneLabel, deriveTradeSessionLabel, formatTradeTimeLabel, resolveTradeOccurredAtFromRow } from '@/lib/utils/trade-time'
import { buildTradeImportSourceFacts, extractTradeImportMeta } from '@/lib/utils/trade-import-meta'
import { getTradeAccountLabel } from '@/lib/utils/account-context'
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

  const captureStatus = normalizeTradeCaptureStatus(row.capture_status)
  const captureResult = normalizeTradeCaptureResult(row.capture_result) ?? inferTradeCaptureResultFromPnL(metrics.netPnL)

  const screenshotUrls = getTradeScreenshotUrls(row, mediaRows)
  const importMeta = extractTradeImportMeta(row.notes)

  const partialPlan = getPartialExitPlanInfo({ exit: row.exit, partialExits: partialExits ?? [] })
  const partialSizePlan = getPartialExitSizePlan({ positionSize: metrics.positionSize, partialExits: partialExits ?? [] })
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
    result: metrics.netPnL !== null ? formatCurrency(metrics.netPnL) : captureResult ? getTradeCaptureResultLabel(captureResult) : '—',
    r: formatRMultiple(metrics.rValue),
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
    partialExitHasOpenRemainder: partialPlan.count ? partialSizePlan.hasOpenRemainder : false,
    effectiveExit: partialPlan.effectiveExit,
    direction: metrics.direction,
    rSource: metrics.rSource,
    pnlSource: metrics.pnlSource,
    pnlMode: metrics.pnlMode,
    costProfile: metrics.costProfile,
    brokerProfile: metrics.brokerProfile,
    accountTemplate: (row.account_template ?? 'manual') as Trade['accountTemplate'],
    accountLabel: getTradeAccountLabel({ accountTemplate: (row.account_template ?? 'manual') as Trade['accountTemplate'] }),
    marketTemplate: (row.market_template ?? 'manual') as Trade['marketTemplate'],
    accountCurrency: metrics.accountCurrency,
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

export function mapTradeRowToTradeDetail(row: TradeRow, mediaRows: TradeMediaRow[] = [], linkedSetup: LinkedSetupReference | null = null): TradeDetail {
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

  const captureStatus = normalizeTradeCaptureStatus(row.capture_status)
  const captureResult = normalizeTradeCaptureResult(row.capture_result) ?? inferTradeCaptureResultFromPnL(metrics.netPnL)

  const costParts = [
    `${getCostProfileLabel(metrics.costProfile)} Profil`,
    `Broker ${getBrokerProfileLabel(metrics.brokerProfile)}`,
    metrics.fees !== null ? `Kommission ${formatCurrency(metrics.fees)}` : null,
    metrics.exchangeFees !== null ? `Börse ${formatCurrency(metrics.exchangeFees)}` : null,
    metrics.fundingFees !== null ? `Funding ${formatCurrency(metrics.fundingFees)}` : null,
    metrics.fundingRateBps !== null ? `Funding-Rate ${formatPlainNumber(metrics.fundingRateBps, 2)} bps` : null,
    metrics.spreadCost !== null ? `Spread ${formatCurrency(metrics.spreadCost)}` : null,
    metrics.slippage !== null ? `Slippage ${formatCurrency(metrics.slippage)}` : null,
    metrics.totalCosts ? `Total ${formatCurrency(metrics.totalCosts)}` : 'Total +0 €',
  ].filter(Boolean)

  const sizeParts = [
    metrics.positionSize !== null ? `Size ${formatPlainNumber(metrics.positionSize, 2)}` : null,
    metrics.pointValue !== null ? `Punktwert ${formatPlainNumber(metrics.pointValue, 2)}` : null,
    metrics.quoteAsset ? `Quote ${metrics.quoteAsset}` : null,
  ].filter(Boolean)

  const marginParts = [
    metrics.marginUsed !== null ? `Margin ${formatPlainNumber(metrics.marginUsed, 2)}${metrics.accountCurrency ? ` ${metrics.accountCurrency}` : ''}` : null,
    metrics.leverage !== null ? `Hebel ${formatPlainNumber(metrics.leverage, 2)}x` : null,
    metrics.exposure !== null ? `Exposure ${formatPlainNumber(metrics.exposure, 2)}${metrics.accountCurrency ? ` ${metrics.accountCurrency}` : ''}` : null,
    metrics.accountSize !== null ? `Konto ${formatPlainNumber(metrics.accountSize, 2)}${metrics.accountCurrency ? ` ${metrics.accountCurrency}` : ''}` : null,
  ].filter(Boolean)

  const screenshotUrls = getTradeScreenshotUrls(row, mediaRows)
  const partialPlan = getPartialExitPlanInfo({ exit: row.exit, partialExits })
  const importMeta = extractTradeImportMeta(row.notes)
  const tradeOccurredAt = resolveTradeOccurredAtFromRow(row)
  const resolvedSession = row.session?.trim() || deriveTradeSessionLabel(tradeOccurredAt)
  const resolvedKillZone = deriveTradeKillZoneLabel(tradeOccurredAt)
  const partialSizePlan = getPartialExitSizePlan({ positionSize: metrics.positionSize, partialExits })
  const partialExitsLabel = partialPlan.count ? formatPartialExitSummary(partialExits) : null

  return {
    title: `${row.market} ${linkedSetup?.title ?? row.setup}`,
    date: `${formatTradeDateLabel(tradeOccurredAt)}${resolvedSession ? ` · ${resolvedSession}` : ''}`,
    result: formatRMultiple(metrics.rValue),
    pnl:
      metrics.netPnL !== null
        ? `${formatCurrency(metrics.netPnL)}${partialPlan.hasRemainder ? ' bisher realisiert · Rest läuft' : ''}`
        : captureResult
          ? `${getTradeCaptureResultLabel(captureResult)} · Schnellerfassung`
          : 'Kein P&L hinterlegt',
    emotion: row.emotion ?? '—',
    setup: linkedSetup?.title ?? row.setup,
    quality: (row.quality ?? 'B-Setup') as TradeDetail['quality'],
    ruleCheck: row.rule_check ?? '—',
    lesson: importMeta.cleanNotes || (captureStatus === 'incomplete' ? 'Schnellerfassung gespeichert. Ergänze später Entry, Exit, Größe und belastbare P&L.' : 'Noch keine Notiz hinterlegt.'),
    reviewRepeatability: row.review_repeatability ?? '—',
    reviewState: row.review_state ?? '—',
    reviewLesson: row.review_lesson ?? '—',
    screenshotUrl: screenshotUrls[0] ?? undefined,
    screenshotUrls,
    screenshotCount: screenshotUrls.length,
    direction:
      metrics.direction === 'long'
        ? 'Long'
        : metrics.direction === 'short'
          ? 'Short'
          : 'Neutral',
    riskReward:
      metrics.riskRewardRatio !== null ? `${formatPlainNumber(metrics.riskRewardRatio)} : 1 geplant` : 'Kein sauberes CRV ableitbar',
    riskAmount:
      metrics.riskAmount !== null ? formatCurrency(metrics.riskAmount) : 'Nicht sicher berechenbar',
    riskPlanLabel:
      metrics.riskPercent !== null
        ? `${formatPlainNumber(metrics.riskPercent, 2)}% geplant${metrics.plannedRiskAmount !== null ? ` · ${formatCurrency(metrics.plannedRiskAmount)}` : ''}`
        : metrics.accountSize !== null
          ? 'Kontogröße da, aber noch kein geplantes Risiko gesetzt'
          : 'Kontogröße optional. Mit Konto + Risiko % wird der Plan sichtbar',
    accountRiskLabel:
      metrics.actualRiskPercent !== null
        ? `${formatPlainNumber(metrics.actualRiskPercent, 2)}% vom Konto`
        : metrics.accountSize !== null
          ? 'Kontogröße da, aber Stop-Risiko noch nicht sauber ableitbar'
          : 'Ohne Kontogröße bleibt nur das absolute Stop-Risiko sichtbar',
    priceRisk:
      metrics.priceRisk !== null ? formatPlainNumber(metrics.priceRisk, 4) : 'Nicht ableitbar',
    rSourceLabel:
      metrics.rSource === 'manual'
        ? 'R manuell hinterlegt'
        : metrics.rSource === 'realized_partial'
          ? 'R aus bereits realisiertem P&L und initialem Stop-Risiko abgeleitet'
          : metrics.rSource === 'realized'
            ? 'R aus realisiertem P&L und initialem Stop-Risiko abgeleitet'
            : metrics.rSource === 'planned'
              ? 'R aus TP grob abgeleitet'
              : 'Kein R-Wert vorhanden',
    pnlSourceLabel:
      captureStatus === 'incomplete'
        ? 'Schnellerfassung ohne belastbare P&L. Dieser Trade kann jetzt im Edit-Flow vervollständigt werden.'
        : metrics.pnlSource === 'manual'
          ? 'P&L manuell hinterlegt'
          : metrics.pnlSource === 'override'
            ? `Auto-Netto ${metrics.autoNetPnL !== null ? formatCurrency(metrics.autoNetPnL) : '—'} wurde manuell überschrieben`
            : metrics.pnlSource === 'derived'
              ? partialPlan.hasRemainder
                ? 'P&L bisher aus bereits realisierten Teilverkäufen, Size und Kosten hergeleitet'
                : 'P&L aus Entry, Exit, Size und Kosten hergeleitet'
              : 'P&L noch nicht belastbar berechenbar',
    pnlModeLabel: getPnLModeLabel(metrics.pnlMode),
    instrumentLabel: getInstrumentLabel(metrics.instrumentType),
    costLabel: costParts.join(' · '),
    costProfileLabel: `Kostenprofil: ${getCostProfileLabel(metrics.costProfile)}`,
    brokerProfileLabel: `Brokerprofil: ${getBrokerProfileLabel(metrics.brokerProfile)}`,
    accountTemplateLabel: `Account: ${getAccountTemplateLabel(row.account_template)}`,
    accountLabel: getTradeAccountLabel({ accountTemplate: (row.account_template ?? 'manual') as Trade['accountTemplate'] }),
    marketTemplateLabel: `Markt-Template: ${getMarketTemplateLabel(row.market_template)}`,
    userCostProfileLabel: row.user_cost_profile_id ? 'Eigenes Nutzer-Kostenprofil aktiv' : undefined,
    sizeLabel: sizeParts.length ? sizeParts.join(' · ') : 'Keine Size-/Punktwertdaten hinterlegt',
    marginLabel: marginParts.length ? marginParts.join(' · ') : 'Noch keine Margin-/Hebelbasis hinterlegt',
    partialExitsLabel: partialExitsLabel ?? undefined,
    partialExitCoverageLabel: partialPlan.count ? formatPartialExitCoverageLabel(partialPlan.coveredPercent, partialPlan.remainderPercent) : undefined,
    partialExitRealizedLabel: partialPlan.count ? formatPartialExitRealizedLabel(partialPlan.coveredPercent, partialSizePlan.realizedSize) : undefined,
    partialExitRemainingLabel: partialPlan.count ? formatPartialExitRemainingLabel(partialPlan.remainderPercent, partialSizePlan.remainingSize) : undefined,
    partialExitStateLabel: partialPlan.count ? (partialSizePlan.hasOpenRemainder ? 'Teilprofit aktiv · Restposition läuft weiter' : 'Teilprofit komplett abgeschlossen') : undefined,
    effectiveExitLabel: partialPlan.effectiveExit !== null ? `${formatPlainNumber(partialPlan.effectiveExit, 4)} Ø Exit` : undefined,
    executionLabel: metrics.grossPnL !== null ? `Brutto ${formatCurrency(metrics.grossPnL)} → Netto ${metrics.netPnL !== null ? formatCurrency(metrics.netPnL) : '—'}${metrics.pnlSource === 'override' && metrics.autoNetPnL !== null ? ` (Auto ${formatCurrency(metrics.autoNetPnL)})` : ''} · ${getExecutionTypeLabel(metrics.executionType)} · ${getFundingDirectionLabel(metrics.fundingDirection)}` : 'Keine belastbare Ausführungsrechnung möglich',
    cryptoLabel: metrics.instrumentType === 'crypto' ? `Krypto-Modus: ${getCryptoMarketTypeLabel(metrics.cryptoMarketType)}${metrics.quoteAsset ? ` · Quote ${metrics.quoteAsset}` : ''}${metrics.leverage !== null ? ` · Hebel ${formatPlainNumber(metrics.leverage, 2)}x` : ''}${metrics.executionType ? ` · ${getExecutionTypeLabel(metrics.executionType)}` : ''}${metrics.fundingDirection ? ` · ${getFundingDirectionLabel(metrics.fundingDirection)}` : ''}` : undefined,
    captureStatusLabel: getTradeCaptureStatusLabel(captureStatus),
    sessionLabel: resolvedSession,
    killZoneLabel: resolvedKillZone,
    tradeTimeLabel: formatTradeTimeLabel(tradeOccurredAt),
    captureTrustLabel: getTradeCaptureTrustLabel(captureStatus, metrics.netPnL !== null),
    captureResultLabel: captureResult ? getTradeCaptureResultLabel(captureResult) : undefined,
    importPresetLabel: importMeta.meta?.presetLabel ?? undefined,
    importFieldSourceFacts: buildTradeImportSourceFacts(importMeta.meta),
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
