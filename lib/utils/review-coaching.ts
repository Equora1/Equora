import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { ReviewSnapshot } from '@/lib/utils/review'
import { buildReviewActionPlan } from '@/lib/utils/review-to-action'

export type CoachingTone = 'emerald' | 'orange' | 'red'

export type ReviewCoachingLane = {
  label: 'Behalten' | 'Bremsen' | 'Testen morgen'
  title: string
  detail: string
  tone: CoachingTone
  href?: string
  cta: string
}

export type ReviewCoachingBrief = {
  headline: string
  summary: string
  focus: string
  lanes: ReviewCoachingLane[]
}

function cleanLead(value: string) {
  return value.replace(/^[„"']+|[“"']+$/g, '').trim()
}

function shortenSentence(value: string, maxLength = 115) {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 1).replace(/\s+$/g, '')}…`
}

function buildFallbackDetail(value: string, fallback: string) {
  const clean = value.trim()
  return clean.length ? shortenSentence(clean) : fallback
}

export function buildReviewCoachingBrief(snapshot: ReviewSnapshot, locale: JournalLocale = 'de'): ReviewCoachingBrief {
  const text = journalText(locale)
  const actionPlan = buildReviewActionPlan(snapshot, locale)
  const keepSignal = snapshot.topPerformers[0] ?? snapshot.tagRadar.find((item) => item.tone === 'emerald')
  const brakeSignal = snapshot.errorClusters[0] ?? snapshot.weakSpots[0] ?? snapshot.tagDrift.find((item) => item.tone !== 'emerald')
  const testRule = snapshot.playbook[0] ?? snapshot.reviewLayer.checklist[0] ?? actionPlan.checklist[0] ?? actionPlan.dailyFocusSuggestion

  const keepStep = actionPlan.steps.find((step) => step.tone === 'emerald')
  const brakeStep = actionPlan.steps.find((step) => step.tone === 'red') ?? actionPlan.steps.find((step) => step.tone === 'orange')
  const lanes: ReviewCoachingLane[] = [
    {
      label: 'Behalten',
      title: keepSignal ? cleanLead(keepSignal.value) : text('Den sauberen Ablauf wiederholen', 'Repeat the process that worked'),
      detail: keepSignal
        ? buildFallbackDetail(keepSignal.detail, text('Das ist gerade die verlässlichste Spur im Review.', 'Start with the strongest pattern in this review.'))
        : text('Halte morgen an dem fest, was im Review bereits stabil aussieht.', 'Keep following the process that has worked consistently.'),
      tone: 'emerald',
      href: keepSignal?.href ?? keepStep?.href ?? '/trades',
      cta: text('Mehr davon öffnen', 'Open supporting trades'),
    },
    {
      label: 'Bremsen',
      title: brakeSignal ? cleanLead(brakeSignal.value) : text('Vor dem ersten Fehler abbremsen', 'Review your rules before entering'),
      detail: brakeSignal
        ? buildFallbackDetail(brakeSignal.detail, text('Das ist gerade die teuerste Spur im Review.', 'Review the trades behind this warning.'))
        : text('Nicht mehr handeln, wenn der Prozess kippt. Erst Struktur, dann Tempo.', 'Take a break when you stop following your process.'),
      tone: brakeStep?.tone === 'orange' ? 'orange' : 'red',
      href: brakeSignal?.href ?? brakeStep?.href ?? '/trades',
      cta: text('Warnmuster öffnen', 'Open trades behind the warning'),
    },
    {
      label: 'Testen morgen',
      title: actionPlan.dailyFocusSuggestion,
      detail: buildFallbackDetail(testRule, text('Ein kleiner Test reicht. Review muss morgen in eine sichtbare Handlung übergehen.', 'Pick one change to try in the next session.')),
      tone: 'orange',
      href: `/trades?reviewFocus=${encodeURIComponent(actionPlan.dailyFocusSuggestion)}`,
      cta: text('Fokus öffnen', 'Open trades for this focus'),
    },
  ]

  const redLanes = lanes.filter((lane) => lane.tone === 'red').length
  const headline = redLanes > 0
    ? text('Drei klare Züge statt zehn guter Vorsätze', 'Three priorities for the next session')
    : text('Das Review wird jetzt zu einer kleinen Agenda für morgen', 'Plan your next session')

  const summary = redLanes > 0
    ? text('Behalten, was trägt. Bremsen, was Geld kostet. Nur einen Test mit in den nächsten Tag nehmen.', 'Keep what worked, address what hurt results and choose one change to try.')
    : text('Nur drei Dinge merken: der stärkste Wiederholer, der wichtigste Warnpunkt und ein Fokus für morgen.', 'Review what worked, the main warning and one focus for next time.')

  return {
    headline,
    summary,
    focus: actionPlan.dailyFocusSuggestion,
    lanes,
  }
}
