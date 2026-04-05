import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { normalizeTradeDate } from '@/lib/utils/calendar'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { getTradeTrustSummary, getTrustedTrades } from '@/lib/utils/trade-trust'
import { formatTradeDateLabel } from '@/lib/utils/date-format'

export type FocusTone = 'emerald' | 'orange' | 'red' | 'none'

export type FocusAnswer = {
  question: string
  answer: string
  detail: string
  tone: FocusTone
}

export type DashboardFocus = {
  title: string
  copy: string
  badge: string
  answers: FocusAnswer[]
}

function getBerlinDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '2026'
  const month = parts.find((part) => part.type === 'month')?.value ?? '03'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'

  return `${year}-${month}-${day}`
}

function shiftDateKey(dateKey: string, days: number) {
  const base = new Date(`${dateKey}T12:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return getBerlinDateKey(base)
}

function getTradeDateKey(trade: Trade) {
  const rawDate = trade.createdAt ?? trade.date
  return getBerlinDateKey(normalizeTradeDate(rawDate))
}

function sortTradesNewestFirst(trades: Trade[]) {
  return [...trades].sort(
    (a, b) => normalizeTradeDate(b.createdAt ?? b.date).getTime() - normalizeTradeDate(a.createdAt ?? a.date).getTime(),
  )
}

function getRecentTradesWindow(trades: Trade[], days = 7) {
  const todayKey = getBerlinDateKey()
  const startKey = shiftDateKey(todayKey, -(days - 1))

  return trades.filter((trade) => {
    const tradeDateKey = getTradeDateKey(trade)
    return tradeDateKey >= startKey && tradeDateKey <= todayKey
  })
}

function truncateCopy(value: string, maxLength = 132) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function buildTodayAnswer(trades: Trade[]): FocusAnswer {
  const todayKey = getBerlinDateKey()
  const tradesToday = trades.filter((trade) => getTradeDateKey(trade) === todayKey)
  const trustedToday = getTrustedTrades(tradesToday)

  if (tradesToday.length) {
    const metrics = getCoreMetrics(trustedToday)
    const answer = trustedToday.length
      ? metrics.netPnL > 0
        ? `Grün mit ${formatCurrency(metrics.netPnL)}`
        : metrics.netPnL < 0
          ? `Rot mit ${formatCurrency(metrics.netPnL)}`
          : 'Flach auf Null'
      : 'Erfasst, aber noch nicht belastbar'

    const detail = trustedToday.length
      ? `${trustedToday.length} trusted Trades · ${metrics.winRate.toFixed(0)}% Win Rate · Ø ${formatRMultiple(metrics.averageR)}`
      : `${tradesToday.length} Einträge heute, aber noch ohne belastbare P&L-Basis.`

    return {
      question: 'Wie lief heute?',
      answer,
      detail,
      tone: trustedToday.length ? (metrics.netPnL >= 0 ? 'emerald' : 'red') : 'orange',
    }
  }

  const latestTrade = sortTradesNewestFirst(trades)[0]
  if (!latestTrade) {
    return {
      question: 'Wie lief heute?',
      answer: 'Noch kein Handelstag im Journal',
      detail: 'Sobald der erste Trade drin ist, baut Equora hier den Tagesfokus automatisch auf.',
      tone: 'none',
    }
  }

  return {
    question: 'Wie lief heute?',
    answer: 'Heute noch kein Trade erfasst',
    detail: `Letzter Handelstag: ${formatTradeDateLabel(latestTrade.createdAt ?? latestTrade.date)} · ${latestTrade.market} · ${latestTrade.setup}`,
    tone: 'orange',
  }
}

function buildBestSetupAnswer(trades: Trade[]): FocusAnswer {
  const recentTrustedTrades = getTrustedTrades(getRecentTradesWindow(trades, 7))

  if (!recentTrustedTrades.length) {
    return {
      question: 'Bestes Setup dieser Woche?',
      answer: 'Noch keine trusted Trades in den letzten 7 Tagen',
      detail: 'Sobald belastbare P&L vorliegt, wird hier automatisch das stärkste Muster sichtbar.',
      tone: 'none',
    }
  }

  const grouped = recentTrustedTrades.reduce<Record<string, Trade[]>>((accumulator, trade) => {
    ;(accumulator[trade.setup] ||= []).push(trade)
    return accumulator
  }, {})

  const best = Object.entries(grouped)
    .map(([setup, setupTrades]) => ({
      setup,
      count: setupTrades.length,
      metrics: getCoreMetrics(setupTrades),
    }))
    .sort((a, b) => {
      if (b.metrics.netPnL !== a.metrics.netPnL) return b.metrics.netPnL - a.metrics.netPnL
      if (b.metrics.winRate !== a.metrics.winRate) return b.metrics.winRate - a.metrics.winRate
      return b.count - a.count
    })[0]

  return {
    question: 'Bestes Setup dieser Woche?',
    answer: `${best.setup} · ${formatCurrency(best.metrics.netPnL)}`,
    detail: `${best.count} trusted Trades in den letzten 7 Tagen · ${best.metrics.winRate.toFixed(0)}% Win Rate · Ø ${formatRMultiple(best.metrics.averageR)}`,
    tone: best.metrics.netPnL >= 0 ? 'emerald' : 'red',
  }
}

function buildReviewHintAnswer(dailyNotes: DailyNoteRow[]): FocusAnswer {
  const latestNote = [...dailyNotes].sort((a, b) => new Date(b.trade_date).getTime() - new Date(a.trade_date).getTime())[0]

  if (!latestNote) {
    return {
      question: 'Wichtigster Review-Hinweis?',
      answer: 'Noch keine Daily Note hinterlegt',
      detail: 'Sobald Tagesnotizen da sind, landet hier der prägnanteste Review-Reminder.',
      tone: 'none',
    }
  }

  const answer = latestNote.focus?.trim() || latestNote.title?.trim() || 'Review-Fokus vorhanden'
  const detail = truncateCopy(latestNote.note?.trim() || 'Der letzte Review-Eintrag ist gespeichert und kann als Tagesfokus wieder aufgegriffen werden.')

  return {
    question: 'Wichtigster Review-Hinweis?',
    answer,
    detail: `${formatTradeDateLabel(latestNote.trade_date)} · ${detail}`,
    tone: 'orange',
  }
}

function buildRiskPointAnswer(trades: Trade[]): FocusAnswer {
  const trustSummary = getTradeTrustSummary(trades)
  const recentTrustedTrades = getTrustedTrades(getRecentTradesWindow(trades, 7))
  const recentMetrics = getCoreMetrics(recentTrustedTrades)
  const recentTrades = getRecentTradesWindow(trades, 7)

  if (trustSummary.incompleteTrades > 0) {
    return {
      question: 'Wo liegt mein aktueller Risikopunkt?',
      answer: `${trustSummary.incompleteTrades} Quick Captures offen`,
      detail: 'Diese Einträge sind sichtbar, aber noch nicht komplett genug für Equity, Stats und sauberen Review-Kontext.',
      tone: 'orange',
    }
  }

  if (trustSummary.completeWithoutPnL > 0) {
    return {
      question: 'Wo liegt mein aktueller Risikopunkt?',
      answer: `${trustSummary.completeWithoutPnL} Trades ohne belastbare P&L`,
      detail: 'Formal fertig, mathematisch noch dünn. Diese Lücke verwässert Vertrauen in die Kennzahlen.',
      tone: 'red',
    }
  }

  if (recentMetrics.currentLossStreak >= 2) {
    return {
      question: 'Wo liegt mein aktueller Risikopunkt?',
      answer: `Verlustserie: ${recentMetrics.currentLossStreak} in Folge`,
      detail: 'Kein Aggro-Mode. Erst Prozessqualität und Selektivität prüfen, dann wieder hochfahren.',
      tone: 'red',
    }
  }

  const groupedRecentTrades = recentTrades.reduce<Record<string, number>>((accumulator, trade) => {
    accumulator[trade.setup] = (accumulator[trade.setup] ?? 0) + 1
    return accumulator
  }, {})

  const topSetup = Object.entries(groupedRecentTrades).sort((a, b) => b[1] - a[1])[0]
  if (topSetup && recentTrades.length >= 3 && topSetup[1] / recentTrades.length >= 0.6) {
    return {
      question: 'Wo liegt mein aktueller Risikopunkt?',
      answer: `Setup-Konzentration auf ${topSetup[0]}`,
      detail: `${topSetup[1]} von ${recentTrades.length} Trades im 7-Tage-Fenster. Gut für Fokus, gefährlich bei Tunnelblick.`,
      tone: 'orange',
    }
  }

  return {
    question: 'Wo liegt mein aktueller Risikopunkt?',
    answer: 'Kein akuter roter Alarm',
    detail: 'Datenabdeckung und jüngster Flow wirken stabil. Der beste Hebel bleibt selektiv und regelkonform zu bleiben.',
    tone: 'emerald',
  }
}

export function getDashboardFocus(trades: Trade[], dailyNotes: DailyNoteRow[]): DashboardFocus {
  const trustSummary = getTradeTrustSummary(trades)
  const todayAnswer = buildTodayAnswer(trades)
  const bestSetupAnswer = buildBestSetupAnswer(trades)
  const reviewHintAnswer = buildReviewHintAnswer(dailyNotes)
  const riskPointAnswer = buildRiskPointAnswer(trades)

  const title =
    trustSummary.incompleteTrades > 0
      ? 'Fokus des Tages: Quick Captures abschließen'
      : reviewHintAnswer.answer !== 'Noch keine Daily Note hinterlegt'
        ? `Fokus des Tages: ${reviewHintAnswer.answer}`
        : bestSetupAnswer.tone === 'emerald'
          ? `Fokus des Tages: Mehr von ${bestSetupAnswer.answer.split(' · ')[0]}`
          : 'Fokus des Tages: Selektiv bleiben'

  const copy =
    trustSummary.needsAttention > 0
      ? 'Equora zeigt heute nicht nur Performance, sondern auch Daten-Schulden. Erst Vertrauen herstellen, dann die Kurven feiern.'
      : 'Vier Antworten statt Zahlen-Nebel: Tageslage, stärkstes Setup, letzter Review-Hinweis und der aktuelle Risikopunkt.'

  const badge = `${trustSummary.trustedTrades}/${trustSummary.totalTrades} trusted`

  return {
    title,
    copy,
    badge,
    answers: [todayAnswer, bestSetupAnswer, reviewHintAnswer, riskPointAnswer],
  }
}
