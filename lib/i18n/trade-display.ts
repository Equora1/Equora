import type { JournalLocale } from '@/lib/i18n/journal'
import type { Trade } from '@/lib/types/trade'
import { formatMoney, getTradeCurrencyStatusForTrade } from '@/lib/utils/currency'
import { journalText } from '@/lib/i18n/journal'
import { formatTradeDateLabel } from '@/lib/utils/date-format'
import { getTradeCaptureResultLabel } from '@/lib/utils/trade-capture'
import { formatTradeRValue, getTradeRValue } from '@/lib/utils/trade-r'

export function formatJournalTradeDate(trade: Trade, locale: JournalLocale) {
  if (locale === 'de' || !trade.tradeOccurredAt || !Number.isFinite(Date.parse(trade.tradeOccurredAt))) return trade.date
  return formatTradeDateLabel(trade.tradeOccurredAt, locale)
}

export function formatJournalTradeResult(trade: Trade, locale: JournalLocale) {
  if (locale === 'de') return trade.result
  return formatJournalTradePnL(trade, locale) ?? (trade.captureResult ? getTradeCaptureResultLabel(trade.captureResult, locale) : trade.result)
}

export function formatJournalTradePnL(trade: Trade, locale: JournalLocale) {
  if (trade.netPnL === null || trade.netPnL === undefined) return null
  if (getTradeCurrencyStatusForTrade(trade) === 'unsupported') {
    return journalText(locale)('Währung nicht unterstützt', 'Unsupported currency')
  }
  return formatMoney(trade.netPnL, trade.accountCurrency, 0, locale)
}

export function formatJournalTradeR(trade: Trade, locale: JournalLocale) {
  if (locale === 'de') return trade.r
  return formatTradeRValue(getTradeRValue(trade), trade.rSource ?? 'manual', locale)
}
