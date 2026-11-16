import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { formatCurrency } from '@/lib/utils/calculations'
import { buildTradesHref, clampNumber, formatDelta } from '@/lib/utils/review-helpers'
import type { ReviewTagComparisonItem } from '@/lib/utils/review-types'
import { buildTagComparisons, getProcessTagShare, getTagCoverage } from '@/lib/utils/review-builder-shared'
import { getCoreMetrics } from '@/lib/utils/analytics'

export function buildTagDrift(tradesCurrent: Trade[], currentTags: TradeTag[], tradesPrevious: Trade[], previousTags: TradeTag[], locale: JournalLocale = 'de'): ReviewTagComparisonItem[] {
  const text = journalText(locale)
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency, locale)
  const comparisons = buildTagComparisons(currentTags, previousTags, tradesCurrent, tradesPrevious)
  const tagCoverageCurrent = getTagCoverage(tradesCurrent, currentTags)
  const tagCoveragePrevious = getTagCoverage(tradesPrevious, previousTags)
  const processShareCurrent = getProcessTagShare(tradesCurrent, currentTags)
  const processSharePrevious = getProcessTagShare(tradesPrevious, previousTags)
  const strongestImprover = [...comparisons]
    .filter((item) => item.current && item.current.totalTrades > 0)
    .sort((left, right) => {
      if (right.pnlDelta === left.pnlDelta) return right.winRateDelta - left.winRateDelta
      return right.pnlDelta - left.pnlDelta
    })[0]
  const biggestSlipper = [...comparisons]
    .filter((item) => item.current && item.current.totalTrades > 0)
    .sort((left, right) => {
      if (left.pnlDelta === right.pnlDelta) return left.winRateDelta - right.winRateDelta
      return left.pnlDelta - right.pnlDelta
    })[0]
  const newWarning = [...comparisons]
    .filter((item) => item.current && !item.previous && (item.current?.netPnL ?? 0) < 0)
    .sort((left, right) => (left.current?.netPnL ?? 0) - (right.current?.netPnL ?? 0))[0]

  const items = [
    strongestImprover
      ? {
          label: 'Aufsteiger-Tag',
          value: strongestImprover.tag,
          detail: text(`${money(strongestImprover.pnlDelta)} und ${formatDelta(strongestImprover.winRateDelta, ' pp')} zur Vorperiode.`, `${money(strongestImprover.pnlDelta)} and ${formatDelta(strongestImprover.winRateDelta, ' percentage points')} vs. the previous period.`),
          tone: strongestImprover.pnlDelta >= 0 ? ('emerald' as const) : ('orange' as const),
          href: buildTradesHref({ tag: strongestImprover.tag, reviewFocus: `Review Drilldown · Aufsteiger-Tag: ${strongestImprover.tag}` }),
        }
      : null,
    biggestSlipper
      ? {
          label: 'Kippender Tag',
          value: biggestSlipper.tag,
          detail: text(`${money(biggestSlipper.pnlDelta)} gegenüber der Vorperiode.`, `${money(biggestSlipper.pnlDelta)} vs. the previous period.`),
          tone: biggestSlipper.pnlDelta < 0 ? ('red' as const) : ('orange' as const),
          href: buildTradesHref({ tag: biggestSlipper.tag, reviewFocus: `Review Drilldown · Kippender Tag: ${biggestSlipper.tag}` }),
        }
      : null,
    newWarning
      ? {
          label: 'Neuer Warn-Tag',
          value: newWarning.tag,
          detail: text(`${money(newWarning.current?.netPnL ?? 0)} ohne Vorperioden-Historie. Frischer Störsender im System.`, `${money(newWarning.current?.netPnL ?? 0)}. This tag had no trades in the previous period.`),
          tone: 'red',
          href: buildTradesHref({ tag: newWarning.tag, outcome: 'Verlierer', reviewFocus: `Review Drilldown · Neuer Warn-Tag: ${newWarning.tag}` }),
        }
      : null,
    tradesCurrent.length > 0
      ? {
          label: 'Prozess-Quote',
          value: `${clampNumber(processShareCurrent)}%`,
          detail: text(`${formatDelta(processShareCurrent - processSharePrevious, ' pp')} vs. Vorperiode · Tag-Abdeckung ${clampNumber(tagCoverageCurrent)}%.`, `${formatDelta(processShareCurrent - processSharePrevious, ' percentage points')} vs. the previous period · ${clampNumber(tagCoverageCurrent)}% of trades tagged.`),
          tone: processShareCurrent >= processSharePrevious ? ('emerald' as const) : ('orange' as const),
        }
      : null,
    tradesCurrent.length > 0
      ? {
          label: 'Tag-Abdeckung',
          value: `${clampNumber(tagCoverageCurrent)}%`,
          detail: text(`${formatDelta(tagCoverageCurrent - tagCoveragePrevious, ' pp')} im Periodenvergleich.`, `${formatDelta(tagCoverageCurrent - tagCoveragePrevious, ' percentage points')} vs. the previous period.`),
          tone: tagCoverageCurrent >= 80 ? ('emerald' as const) : tagCoverageCurrent >= 60 ? ('orange' as const) : ('red' as const),
        }
      : null,
  ].filter(Boolean) as ReviewTagComparisonItem[]

  return items.length
    ? items.slice(0, 4)
    : [
        {
          label: 'Tag-Drift',
          value: text('Noch keine Vergleichsdaten', 'No comparison data yet'),
          detail: text('Sobald zwei Perioden sinnvoll befüllt sind, markiert Equora hier Aufsteiger, kippende Tags und Prozess-Drift.', 'When both periods have comparable data, see how tag results and coverage changed.'),
          tone: 'orange',
        },
      ]
}
