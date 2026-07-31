import type { Trade } from '@/lib/types/trade'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import { buildTradesHref, clampNumber, shortenReviewText } from '@/lib/utils/review-helpers'
import type { ReviewLayerSnapshot, ReviewTagRadarItem } from '@/lib/utils/review-types'

export function normalizeReviewValue(value: string | null | undefined) {
  const clean = value?.trim()
  if (!clean || clean === '—') return ''
  return clean
}

export function buildReviewLayerSnapshot(tradesCurrent: Trade[]): ReviewLayerSnapshot {
  const reviewedTrades = tradesCurrent.filter((trade) =>
    Boolean(
      normalizeReviewValue(trade.ruleCheck) ||
      normalizeReviewValue(trade.reviewRepeatability) ||
      normalizeReviewValue(trade.reviewState) ||
      normalizeReviewValue(trade.reviewLesson)
    )
  )
  const totalTrades = tradesCurrent.length
  const coverage = totalTrades ? (reviewedTrades.length / totalTrades) * 100 : 0

  const countValues = (values: (string | null | undefined)[]) => {
    const map = new Map<string, number>()
    for (const value of values.map(normalizeReviewValue).filter(Boolean)) {
      map.set(value, (map.get(value) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }

  const ruleCounts = countValues(reviewedTrades.map((trade) => trade.ruleCheck))
  const repeatCounts = countValues(reviewedTrades.map((trade) => trade.reviewRepeatability))
  const stateCounts = countValues(reviewedTrades.map((trade) => trade.reviewState || trade.emotion))

  const ruleYes = ruleCounts.find(([value]) => value === 'Ja')?.[1] ?? 0
  const ruleNo = ruleCounts.find(([value]) => value === 'Nein')?.[1] ?? 0
  const repeatYes = repeatCounts.find(([value]) => value === 'Ja')?.[1] ?? 0
  const repeatNo = repeatCounts.find(([value]) => value === 'Nein')?.[1] ?? 0
  const dominantState = stateCounts[0]

  const latestLessonTrade = [...reviewedTrades]
    .filter((trade) => normalizeReviewValue(trade.reviewLesson))
    .sort((a, b) => new Date(resolveTradeOccurredAt(b)).getTime() - new Date(resolveTradeOccurredAt(a)).getTime())[0]
  const latestLesson = normalizeReviewValue(latestLessonTrade?.reviewLesson) || null

  const highlights: ReviewTagRadarItem[] = []

  if (ruleCounts.length) {
    const tone = ruleNo > ruleYes ? 'red' as const : ruleYes >= Math.max(1, ruleNo) ? 'emerald' as const : 'orange' as const
    const href = buildTradesHref({ reviewFocus: `Verhaltensprüfung · Regelkonformität ${ruleCounts[0][0]}` })
    highlights.push({
      label: 'Regelspur',
      value: `${ruleYes}/${reviewedTrades.length || 1} Ja`,
      detail: ruleNo > 0
        ? `${ruleNo} Trades wurden im Review klar als nicht regelkonform markiert.`
        : 'Die meisten gesetzten Reviews zeigen einen sauberen Regelpfad.',
      tone,
      href,
    })
  }

  if (repeatCounts.length) {
    const tone = repeatYes >= Math.max(1, repeatNo) ? 'emerald' as const : repeatNo > 0 ? 'orange' as const : 'orange' as const
    highlights.push({
      label: 'Replizierbarkeit',
      value: repeatCounts[0][0],
      detail: repeatYes > 0
        ? `${repeatYes} Trades würdest du in ähnlicher Form wieder nehmen.`
        : repeatNo > 0
          ? `${repeatNo} Trades sollen so ausdrücklich nicht wiederkommen.`
          : 'Noch kein klares Wiederholungsmuster im Verhaltensprüfung.',
      tone,
      href: buildTradesHref({ reviewFocus: `Verhaltensprüfung · Replizierbarkeit ${repeatCounts[0][0]}` }),
    })
  }

  if (dominantState) {
    const stateTone = ['Impulsiv', 'Unscharf', 'Müde', 'Gejagt'].includes(dominantState[0]) ? 'red' as const : ['Geduldig', 'Fokussiert'].includes(dominantState[0]) ? 'emerald' as const : 'orange' as const
    highlights.push({
      label: 'Dominanter Zustand',
      value: dominantState[0],
      detail: `${dominantState[1]} Review-Trades tragen dieses Zustandsmuster.`,
      tone: stateTone,
      href: buildTradesHref({ reviewFocus: `Verhaltensprüfung · Zustand ${dominantState[0]}` }),
    })
  }

  if (latestLesson) {
    highlights.push({
      label: 'Letzter Lerneffekt',
      value: 'Kurz notiert',
      detail: shortenReviewText(latestLesson, 120),
      tone: 'orange',
      href: latestLessonTrade ? buildTradesHref({ search: latestLessonTrade.market, reviewFocus: 'Verhaltensprüfung · Letzter Lerneffekt' }) : undefined,
    })
  }

  const headline = !totalTrades
    ? 'Noch keine Review-Signale im Zeitraum'
    : coverage >= 70
      ? 'Der Verhaltensprüfung liefert schon belastbare Verhaltenstrends'
      : coverage >= 35
        ? 'Der Verhaltensprüfung zeigt erste Verhaltensmuster'
        : 'Der Verhaltensprüfung ist noch punktuell, aber schon nützlich'

  const summary = !totalTrades
    ? 'Sobald Trades im Zeitraum liegen, verdichtet Equora hier Regelspur, Replizierbarkeit, Zustand und Lerneffekte.'
    : reviewedTrades.length === 0
      ? 'Noch kein Trade im Zeitraum wurde im Verhaltensprüfung nachgezogen. Genau dort werden aus Fakten echte Verhaltenssignale.'
      : `${reviewedTrades.length} von ${totalTrades} Trades tragen Review-Signale. ${ruleNo > 0 ? `${ruleNo} Trades fallen klar als Regelbruch auf.` : repeatYes > 0 ? `${repeatYes} Trades sehen nach replizierbarem Kernmaterial aus.` : 'Der Layer zeigt erste Muster für Verhalten und P&L.'}`

  const checklist = [
    coverage < 70 ? 'Offene Trades im Edit-Flow kurz mit Review-Signalen nachziehen' : null,
    ruleNo > 0 ? `Regelbruch-Setups aus ${ruleNo} Trades vor dem nächsten Entry aktiv gegenprüfen` : null,
    repeatYes > 0 ? `${repeatYes} replizierbare Trades als Referenz offen halten` : null,
    dominantState ? `Vor dem Open auf Zustand „${dominantState[0]}“ achten` : null,
    latestLesson ? shortenReviewText(latestLesson, 100) : null,
  ].filter(Boolean) as string[]

  return {
    reviewedTrades: reviewedTrades.length,
    totalTrades,
    coverage,
    summary,
    headline,
    highlights: highlights.slice(0, 4),
    checklist: Array.from(new Set(checklist)).slice(0, 4),
    latestLesson,
  }
}

