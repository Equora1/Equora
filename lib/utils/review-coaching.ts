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

export function buildReviewCoachingBrief(snapshot: ReviewSnapshot): ReviewCoachingBrief {
  const actionPlan = buildReviewActionPlan(snapshot)
  const keepSignal = snapshot.topPerformers[0] ?? snapshot.tagRadar.find((item) => item.tone === 'emerald')
  const brakeSignal = snapshot.errorClusters[0] ?? snapshot.weakSpots[0] ?? snapshot.tagDrift.find((item) => item.tone !== 'emerald')
  const testRule = snapshot.playbook[0] ?? snapshot.reviewLayer.checklist[0] ?? actionPlan.checklist[0] ?? actionPlan.dailyFocusSuggestion

  const keepStep = actionPlan.steps.find((step) => step.tone === 'emerald')
  const brakeStep = actionPlan.steps.find((step) => step.tone === 'red') ?? actionPlan.steps.find((step) => step.tone === 'orange')
  const lanes: ReviewCoachingLane[] = [
    {
      label: 'Behalten',
      title: keepSignal ? cleanLead(keepSignal.value) : 'Den sauberen Ablauf wiederholen',
      detail: keepSignal
        ? buildFallbackDetail(keepSignal.detail, 'Das ist gerade die verlässlichste Spur im Review.')
        : 'Halte morgen an dem fest, was im Review bereits stabil aussieht.',
      tone: 'emerald',
      href: keepSignal?.href ?? keepStep?.href ?? '/trades',
      cta: 'Mehr davon öffnen',
    },
    {
      label: 'Bremsen',
      title: brakeSignal ? cleanLead(brakeSignal.value) : 'Vor dem ersten Fehler abbremsen',
      detail: brakeSignal
        ? buildFallbackDetail(brakeSignal.detail, 'Das ist gerade die teuerste Spur im Review.')
        : 'Nicht mehr handeln, wenn der Prozess kippt. Erst Struktur, dann Tempo.',
      tone: brakeStep?.tone === 'orange' ? 'orange' : 'red',
      href: brakeSignal?.href ?? brakeStep?.href ?? '/trades',
      cta: 'Warnmuster öffnen',
    },
    {
      label: 'Testen morgen',
      title: actionPlan.dailyFocusSuggestion,
      detail: buildFallbackDetail(testRule, 'Ein kleiner Test reicht. Review muss morgen in eine sichtbare Handlung übergehen.'),
      tone: 'orange',
      href: `/daily-note?focus=${encodeURIComponent(actionPlan.dailyFocusSuggestion)}`,
      cta: 'Als Fokus übernehmen',
    },
  ]

  const redLanes = lanes.filter((lane) => lane.tone === 'red').length
  const headline = redLanes > 0
    ? 'Drei klare Züge statt zehn guter Vorsätze'
    : 'Das Review wird jetzt zu einer kleinen Agenda für morgen'

  const summary = redLanes > 0
    ? 'Behalten, was trägt. Bremsen, was Geld kostet. Nur einen Test mit in den nächsten Tag nehmen.'
    : 'Nur drei Dinge merken: der stärkste Wiederholer, der wichtigste Warnpunkt und ein Fokus für morgen.'

  return {
    headline,
    summary,
    focus: actionPlan.dailyFocusSuggestion,
    lanes,
  }
}
