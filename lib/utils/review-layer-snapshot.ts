import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { formatReviewAnswer, formatReviewState } from '@/lib/utils/review-display'
import type { Trade } from '@/lib/types/trade'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import { buildTradesHref, clampNumber, shortenReviewText } from '@/lib/utils/review-helpers'
import type { ReviewLayerSnapshot, ReviewTagRadarItem } from '@/lib/utils/review-types'

export function normalizeReviewValue(value: string | null | undefined) {
  const clean = value?.trim()
  if (!clean || clean === '—') return ''
  return clean
}

export function hasTradeReview(trade: Trade) {
  return Boolean(normalizeReviewValue(trade.ruleCheck) || normalizeReviewValue(trade.reviewRepeatability)
    || normalizeReviewValue(trade.reviewState) || normalizeReviewValue(trade.reviewLesson))
}

export function resolveTradeReviewState(trade: Trade) {
  return normalizeReviewValue(trade.reviewState) || normalizeReviewValue(trade.emotion)
}

export function buildReviewLayerSnapshot(tradesCurrent: Trade[], locale: JournalLocale = 'de'): ReviewLayerSnapshot {
  const text = journalText(locale)
  const reviewedTrades = tradesCurrent.filter(hasTradeReview)
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
  const stateCounts = countValues(reviewedTrades.map(resolveTradeReviewState))

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
    const href = buildTradesHref({ reviewMatch: 'reviewed', reviewFocus: `Verhaltensprüfung · Regelkonformität ${ruleCounts[0][0]}` })
    highlights.push({
      label: 'Regelspur',
      value: text(`${ruleYes}/${reviewedTrades.length || 1} Ja`, `${ruleYes}/${reviewedTrades.length || 1} yes`),
      detail: ruleNo > 0
        ? text(`${ruleNo} Trades wurden im Review klar als nicht regelkonform markiert.`, `${ruleNo} trades were marked as breaking the rules.`)
        : text('Die meisten gesetzten Reviews zeigen einen sauberen Regelpfad.', 'The recorded reviews mostly followed the rules.'),
      tone,
      href,
    })
  }

  if (repeatCounts.length) {
    const tone = repeatYes >= Math.max(1, repeatNo) ? 'emerald' as const : repeatNo > 0 ? 'orange' as const : 'orange' as const
    highlights.push({
      label: 'Replizierbarkeit',
      value: formatReviewAnswer(repeatCounts[0][0], locale),
      detail: repeatYes > 0
        ? text(`${repeatYes} Trades würdest du in ähnlicher Form wieder nehmen.`, `You would take ${repeatYes} similar trades again.`)
        : repeatNo > 0
          ? text(`${repeatNo} Trades sollen so ausdrücklich nicht wiederkommen.`, `You would avoid repeating ${repeatNo} trades.`)
          : text('Noch kein klares Wiederholungsmuster im Verhaltensprüfung.', 'No clear pattern in which trades you would repeat.'),
      tone,
      href: buildTradesHref({ reviewMatch: 'repeatability', reviewFocus: `Verhaltensprüfung · Replizierbarkeit ${repeatCounts[0][0]}` }),
    })
  }

  if (dominantState) {
    const stateTone = ['Impulsiv', 'Unscharf', 'Müde', 'Gejagt'].includes(dominantState[0]) ? 'red' as const : ['Geduldig', 'Fokussiert'].includes(dominantState[0]) ? 'emerald' as const : 'orange' as const
    highlights.push({
      label: 'Dominanter Zustand',
      value: formatReviewState(dominantState[0], locale),
      detail: text(`${dominantState[1]} Review-Trades tragen dieses Zustandsmuster.`, `${dominantState[1]} reviewed trades had this mindset.`),
      tone: stateTone,
      href: buildTradesHref({ reviewMatch: 'state', reviewValue: dominantState[0], reviewFocus: `Verhaltensprüfung · Zustand ${dominantState[0]}` }),
    })
  }

  if (latestLesson) {
    highlights.push({
      label: 'Letzter Lerneffekt',
      value: text('Kurz notiert', 'Recorded'),
      detail: shortenReviewText(latestLesson, 120),
      tone: 'orange',
      href: latestLessonTrade ? buildTradesHref({ reviewMatch: 'trade', reviewValue: latestLessonTrade.id, reviewFocus: 'Verhaltensprüfung · Letzter Lerneffekt' }) : undefined,
    })
  }

  const headline = !totalTrades
    ? text('Noch keine Review-Signale im Zeitraum', 'No review signals in this period')
    : coverage >= 70
      ? text('Die Verhaltensprüfung liefert schon belastbare Verhaltenstrends', 'Review coverage is high')
      : coverage >= 35
        ? text('Die Verhaltensprüfung zeigt erste Verhaltensmuster', 'Behaviour patterns are emerging')
        : text('Die Verhaltensprüfung ist noch punktuell, aber schon nützlich', 'Few trades have been reviewed')

  const summary = !totalTrades
    ? text('Sobald Trades im Zeitraum liegen, verdichtet Equora hier Regelspur, Replizierbarkeit, Zustand und Lerneffekte.', 'Add trades to review rule adherence, repeatability, mindset and takeaways.')
    : reviewedTrades.length === 0
      ? text('Für diesen Zeitraum fehlen noch Angaben zu deinen Entscheidungen. Ergänze sie in den Tradedetails, um Verhaltensmuster zu erkennen.', 'Add review details to your trades to see patterns in your decisions.')
      : text(`${reviewedTrades.length} von ${totalTrades} Trades tragen Review-Signale. ${ruleNo > 0 ? `${ruleNo} Trades fallen klar als Regelbruch auf.` : repeatYes > 0 ? `${repeatYes} Trades sehen nach replizierbarem Kernmaterial aus.` : 'Die Angaben zeigen erste Muster in deinen Entscheidungen.'}`, `You reviewed ${reviewedTrades.length} of ${totalTrades} trades. ${ruleNo > 0 ? `${ruleNo} trades were marked as breaking the rules.` : repeatYes > 0 ? `You would take ${repeatYes} similar trades again.` : 'These reviews show early patterns in your decisions.'}`)

  const checklist = [
    coverage < 70 ? text('Fehlende Angaben zu deinen Entscheidungen in den Tradedetails ergänzen', 'Fill in the missing review details on your trades') : null,
    ruleNo > 0 ? text(`Regelbruch-Setups aus ${ruleNo} Trades vor dem nächsten Einstieg prüfen`, `Review the ${ruleNo} trades that broke the rules before your next entry`) : null,
    repeatYes > 0 ? text(`${repeatYes} replizierbare Trades als Referenz offen halten`, `Keep the ${repeatYes} trades you would repeat open as a reference`) : null,
    dominantState ? text(`Vor dem Einstieg auf Zustand „${dominantState[0]}“ achten`, `Check for “${formatReviewState(dominantState[0], locale)}” before entering`) : null,
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

