import type { Trade } from '@/lib/types/trade'
import type { ReviewTagRadarItem } from '@/lib/utils/review-types'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { getCoreMetrics } from '@/lib/utils/analytics'

type SetupBucket = {
  setup: string
  trades: Trade[]
  netPnL: number
  averageR: number
  winRate: number
}

function normalizeSetupName(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || trimmed === '—' || trimmed.toLowerCase() === 'setup') return ''
  return trimmed
}

function toneFromPnL(value: number) {
  if (value > 0) return 'emerald' as const
  if (value < 0) return 'red' as const
  return 'orange' as const
}

function buildSetupBuckets(trades: Trade[]): SetupBucket[] {
  const grouped = new Map<string, Trade[]>()
  trades.forEach((trade) => {
    const setup = normalizeSetupName(trade.setup)
    if (!setup) return
    grouped.set(setup, [...(grouped.get(setup) ?? []), trade])
  })

  return Array.from(grouped.entries())
    .map(([setup, setupTrades]) => {
      const metrics = getCoreMetrics(setupTrades)
      return {
        setup,
        trades: setupTrades,
        netPnL: metrics.netPnL,
        averageR: metrics.averageR,
        winRate: metrics.winRate,
      }
    })
    .sort((left, right) => right.trades.length - left.trades.length || Math.abs(right.netPnL) - Math.abs(left.netPnL))
}

export function buildReviewSetupInsights(trades: Trade[]): ReviewTagRadarItem[] {
  const currency = getCoreMetrics(trades).currency
  const money = (value: number) => formatCurrency(value, 0, currency)
  const buckets = buildSetupBuckets(trades)
  if (!buckets.length) {
    return [
      {
        label: 'Setups',
        value: 'Noch nicht verknüpft',
        detail: 'Trades einem Setup zuordnen. Dann sieht Review, was wirklich trägt.',
        tone: 'orange',
        href: '/setups',
      },
    ]
  }

  const strongest = [...buckets].sort((left, right) => right.netPnL - left.netPnL)[0]
  const weakest = [...buckets].sort((left, right) => left.netPnL - right.netPnL)[0]
  const mostTraded = buckets[0]
  const insights: ReviewTagRadarItem[] = []

  if (strongest) {
    insights.push({
      label: 'Trägt',
      value: strongest.setup,
      detail: `${strongest.trades.length} Trades · ${money(strongest.netPnL)} · Winrate ${Math.round(strongest.winRate)}% · ØR ${formatRMultiple(strongest.averageR)}`,
      tone: toneFromPnL(strongest.netPnL),
      href: `/trades?setup=${encodeURIComponent(strongest.setup)}`,
    })
  }

  if (weakest && weakest.setup !== strongest?.setup && weakest.netPnL < 0) {
    insights.push({
      label: 'Prüfen',
      value: weakest.setup,
      detail: `${weakest.trades.length} Trades · ${money(weakest.netPnL)}. Regel oder Session enger fassen.`,
      tone: 'red',
      href: `/trades?setup=${encodeURIComponent(weakest.setup)}&reviewFocus=${encodeURIComponent('Setup prüfen')}`,
    })
  }

  if (mostTraded && mostTraded.setup !== strongest?.setup && mostTraded.setup !== weakest?.setup) {
    insights.push({
      label: 'Häufig',
      value: mostTraded.setup,
      detail: `${mostTraded.trades.length} Trades · ${money(mostTraded.netPnL)}. Prüfen, ob Häufigkeit auch Qualität bringt.`,
      tone: toneFromPnL(mostTraded.netPnL),
      href: `/trades?setup=${encodeURIComponent(mostTraded.setup)}`,
    })
  }

  return insights.slice(0, 3)
}

export function buildReviewImportInsights(trades: Trade[]): ReviewTagRadarItem[] {
  const importedTrades = trades.filter((trade) => trade.hasImportMeta)
  if (!importedTrades.length) {
    return [
      {
        label: 'Import',
        value: 'Manuelle Trades',
        detail: 'Keine Importdaten im Zeitraum. Review liest nur manuelle Einträge.',
        tone: 'orange',
        href: '/trades',
      },
    ]
  }

  const missingR = importedTrades.filter((trade) => trade.rSource === 'missing' || trade.rValue === undefined || trade.rValue === null || !Number.isFinite(trade.rValue))
  const pnlFromFile = importedTrades.filter((trade) => trade.pnlSource === 'manual' || trade.pnlSource === 'override' || trade.pnlSource === 'derived')
  const warnings = importedTrades.reduce((sum, trade) => sum + (trade.importWarnings?.length ?? 0), 0)
  const trustScores = importedTrades.map((trade) => trade.importTrustScore).filter((value): value is number => typeof value === 'number')
  const averageTrust = trustScores.length ? Math.round(trustScores.reduce((sum, value) => sum + value, 0) / trustScores.length) : null
  const preset = importedTrades.find((trade) => trade.importPresetLabel)?.importPresetLabel ?? 'Import'

  const insights: ReviewTagRadarItem[] = [
    {
      label: 'Import',
      value: `${importedTrades.length} importiert`,
      detail: averageTrust !== null ? `${preset} · Vertrauen ${averageTrust}%. Feldherkunft im Trade-Detail prüfen.` : `${preset}. Feldherkunft im Trade-Detail prüfen.`,
      tone: averageTrust !== null && averageTrust >= 75 ? 'emerald' : 'orange',
      href: '/trades',
    },
  ]

  if (missingR.length) {
    insights.push({
      label: 'R offen',
      value: `${missingR.length} Trade${missingR.length === 1 ? '' : 's'}`,
      detail: 'Stop oder Risiko fehlt im Export. R nicht erzwingen, Risiko nachtragen.',
      tone: 'orange',
      href: `/trades?reviewFocus=${encodeURIComponent('R offen')}`,
    })
  }

  if (warnings) {
    insights.push({
      label: 'Warnungen',
      value: `${warnings} Hinweis${warnings === 1 ? '' : 'e'}`,
      detail: 'Import-Zeilen mit Hinweis zuerst prüfen. Lieber offen als falsch sauber.',
      tone: 'red',
      href: `/trades?reviewFocus=${encodeURIComponent('Import prüfen')}`,
    })
  } else if (pnlFromFile.length) {
    insights.push({
      label: 'P&L',
      value: 'Aus Datei',
      detail: `${pnlFromFile.length} Ergebnis${pnlFromFile.length === 1 ? '' : 'se'} wurden aus Importdaten gelesen, nicht geraten.`,
      tone: 'emerald',
      href: '/trades',
    })
  }

  return insights.slice(0, 3)
}
