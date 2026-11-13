import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade } from '@/lib/types/trade'
import { getAccountTemplateLabel } from '@/lib/utils/trade-presets'

export const DEFAULT_ACCOUNT_KEY = 'manual'
export const DEFAULT_ACCOUNT_LABEL = 'Hauptkonto'

export type AccountContext = {
  key: string
  label: string
  trades: number
  netPnL: number
  winners: number
  losers: number
  winRate: number
  lastTradeAt: string | null
}

export function getTradeAccountKey(trade: Pick<Trade, 'accountId' | 'accountTemplate' | 'brokerProfile'>) {
  return trade.accountId || trade.accountTemplate || DEFAULT_ACCOUNT_KEY
}

export function getTradeAccountLabel(trade: Pick<Trade, 'accountLabel' | 'accountId' | 'accountTemplate' | 'brokerProfile'>, locale: JournalLocale = 'de') {
  if (trade.accountLabel?.trim()) return trade.accountLabel.trim()
  const key = getTradeAccountKey(trade)
  if (key === DEFAULT_ACCOUNT_KEY) return journalText(locale)(DEFAULT_ACCOUNT_LABEL, 'Main account')
  return getAccountTemplateLabel(key, locale)
}

export function buildAccountContexts(trades: Trade[]): AccountContext[] {
  const map = new Map<string, AccountContext>()

  for (const trade of trades) {
    const key = getTradeAccountKey(trade)
    const existing = map.get(key) ?? {
      key,
      label: getTradeAccountLabel(trade),
      trades: 0,
      netPnL: 0,
      winners: 0,
      losers: 0,
      winRate: 0,
      lastTradeAt: null,
    }

    existing.trades += 1
    const pnl = trade.netPnL ?? 0
    existing.netPnL += pnl
    if (trade.netPnL !== undefined && trade.netPnL !== null) {
      if (pnl > 0) existing.winners += 1
      if (pnl < 0) existing.losers += 1
    }
    const timestamp = trade.tradeOccurredAt ?? trade.createdAt ?? trade.date
    if (timestamp && (!existing.lastTradeAt || new Date(timestamp).getTime() > new Date(existing.lastTradeAt).getTime())) {
      existing.lastTradeAt = timestamp
    }

    map.set(key, existing)
  }

  return Array.from(map.values())
    .map((context) => {
      const closed = context.winners + context.losers
      return { ...context, winRate: closed ? (context.winners / closed) * 100 : 0 }
    })
    .sort((left, right) => right.trades - left.trades || left.label.localeCompare(right.label, 'de'))
}

export function getAccountOptionLabels(trades: Trade[]) {
  const counts = new Map<string, number>()
  for (const trade of trades) {
    const label = getTradeAccountLabel(trade)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right, 'de'))
    .map(([label]) => label)
}

export function getTradeAccountDisplayLabels(trades: Trade[], locale: JournalLocale) {
  const labels = new Map<string, string>()
  for (const trade of trades) {
    const filterValue = getTradeAccountLabel(trade)
    const label = getTradeAccountLabel(trade, locale)
    const existing = labels.get(filterValue)
    labels.set(filterValue, existing !== undefined && existing !== label ? filterValue : label)
  }
  return labels
}
