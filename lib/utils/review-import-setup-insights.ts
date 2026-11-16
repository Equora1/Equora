import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade } from '@/lib/types/trade'
import type { ReviewTagRadarItem } from '@/lib/utils/review-types'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { getCoreMetrics } from '@/lib/utils/analytics'

type SetupBucket = {
  setup: string
  trades: Trade[]
  netPnL: number
  averageR: number | null
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

export function buildReviewSetupInsights(trades: Trade[], locale: JournalLocale = 'de'): ReviewTagRadarItem[] {
  const text = journalText(locale)
  const currency = getCoreMetrics(trades).currency
  const money = (value: number) => formatCurrency(value, 0, currency, locale)
  const buckets = buildSetupBuckets(trades)
  if (!buckets.length) {
    return [
      {
        label: 'Setups',
        value: text('Noch nicht verknüpft', 'No linked setups'),
        detail: text('Trades einem Setup zuordnen. Dann sieht Review, was wirklich trägt.', 'Link trades to setups to see how each setup performed.'),
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
      label: text('Trägt', 'Strongest'),
      value: strongest.setup,
      detail: text(`${strongest.trades.length} Trades · ${money(strongest.netPnL)} · Trefferquote ${Math.round(strongest.winRate)}% · ØR ${formatRMultiple(strongest.averageR, 2, locale)}`, `${strongest.trades.length} trades · ${money(strongest.netPnL)} · ${Math.round(strongest.winRate)}% win rate · Avg. R ${formatRMultiple(strongest.averageR, 2, locale)}`),
      tone: toneFromPnL(strongest.netPnL),
      href: `/trades?setup=${encodeURIComponent(strongest.setup)}`,
    })
  }

  if (weakest && weakest.setup !== strongest?.setup && weakest.netPnL < 0) {
    insights.push({
      label: text('Prüfen', 'Review'),
      value: weakest.setup,
      detail: text(`${weakest.trades.length} Trades · ${money(weakest.netPnL)}. Regel oder Session enger fassen.`, `${weakest.trades.length} trades · ${money(weakest.netPnL)}. Review the setup rules or session.`),
      tone: 'red',
      href: `/trades?setup=${encodeURIComponent(weakest.setup)}&reviewFocus=${encodeURIComponent('Setup prüfen')}`,
    })
  }

  if (mostTraded && mostTraded.setup !== strongest?.setup && mostTraded.setup !== weakest?.setup) {
    insights.push({
      label: text('Häufig', 'Most traded'),
      value: mostTraded.setup,
      detail: text(`${mostTraded.trades.length} Trades · ${money(mostTraded.netPnL)}. Prüfen, ob Häufigkeit auch Qualität bringt.`, `${mostTraded.trades.length} trades · ${money(mostTraded.netPnL)}. Review whether trading it more often improved results.`),
      tone: toneFromPnL(mostTraded.netPnL),
      href: `/trades?setup=${encodeURIComponent(mostTraded.setup)}`,
    })
  }

  return insights.slice(0, 3)
}

export function buildReviewImportInsights(trades: Trade[], locale: JournalLocale = 'de'): ReviewTagRadarItem[] {
  const text = journalText(locale)
  const importedTrades = trades.filter((trade) => trade.hasImportMeta)
  if (!importedTrades.length) {
    return [
      {
        label: 'Import',
        value: text('Manuelle Trades', 'Manually entered trades'),
        detail: text('Keine Importdaten im Zeitraum. Review liest nur manuelle Einträge.', 'No imported trades in this period.'),
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
      value: text(`${importedTrades.length} importiert`, `${importedTrades.length} imported`),
      detail: averageTrust !== null ? text(`${preset} · Vertrauen ${averageTrust}%. Feldherkunft im Trade-Detail prüfen.`, `${preset} · ${averageTrust}% confidence. Open trade details to see where each field came from.`) : text(`${preset}. Feldherkunft im Trade-Detail prüfen.`, `${preset}. Open trade details to see where each field came from.`),
      tone: averageTrust !== null && averageTrust >= 75 ? 'emerald' : 'orange',
      href: '/trades',
    },
  ]

  if (missingR.length) {
    insights.push({
      label: text('R offen', 'R missing'),
      value: `${missingR.length} Trade${missingR.length === 1 ? '' : 's'}`,
      detail: text('Stop oder Risiko fehlt im Export. R nicht erzwingen, Risiko nachtragen.', 'The export lacks a stop or risk value. Add the missing risk data before calculating R.'),
      tone: 'orange',
      href: `/trades?reviewFocus=${encodeURIComponent(text('R offen', 'R missing'))}`,
    })
  }

  if (warnings) {
    insights.push({
      label: text('Warnungen', 'Warnings'),
      value: text(`${warnings} Hinweis${warnings === 1 ? '' : 'e'}`, `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`),
      detail: text('Import-Zeilen mit Hinweis zuerst prüfen. Lieber offen als falsch sauber.', 'Review import rows with warnings first.'),
      tone: 'red',
      href: `/trades?reviewFocus=${encodeURIComponent('Import prüfen')}`,
    })
  } else if (pnlFromFile.length) {
    insights.push({
      label: 'P&L',
      value: text('Aus Datei', 'From file'),
      detail: text(`${pnlFromFile.length} Ergebnis${pnlFromFile.length === 1 ? '' : 'se'} wurden aus Importdaten gelesen, nicht geraten.`, `${pnlFromFile.length} ${pnlFromFile.length === 1 ? 'result came' : 'results came'} directly from the import file.`),
      tone: 'emerald',
      href: '/trades',
    })
  }

  return insights.slice(0, 3)
}
