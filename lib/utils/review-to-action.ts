import { getReviewPeriodPresetLabel, type ReviewSnapshot } from '@/lib/utils/review'

type ActionTone = 'emerald' | 'orange' | 'red'

export type ReviewActionStep = {
  lane: string
  title: string
  instruction: string
  reason: string
  tone: ActionTone
  href?: string
}

export type ReviewActionPlan = {
  headline: string
  summary: string
  dailyFocusSuggestion: string
  watchword: string
  steps: ReviewActionStep[]
  checklist: string[]
}

function cleanLead(value: string) {
  return value.replace(/^[„"']+|[“"']+$/g, '').trim()
}

function shortenSentence(value: string, maxLength = 120) {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, maxLength - 1).replace(/\s+$/g, '')}…`
}

function buildFocusSuggestion(snapshot: ReviewSnapshot) {
  const reviewRuleRisk = snapshot.reviewLayer.highlights.find((item) => item.label === 'Regelspur' && item.tone === 'red')
  const reviewStateRisk = snapshot.reviewLayer.highlights.find((item) => item.label === 'Dominanter Zustand' && item.tone === 'red')
  const reviewRepeatability = snapshot.reviewLayer.highlights.find((item) => item.label === 'Replizierbarkeit' && item.tone === 'emerald')
  const bestSetup = snapshot.topPerformers.find((item) => item.label === 'Bestes Setup') ?? snapshot.topPerformers[0]
  const weakSetup = snapshot.weakSpots.find((item) => item.label === 'Schwächstes Setup')
  const negativeTrigger = snapshot.weakSpots.find((item) => item.label === 'Negativer Tag-Trigger')
  const lossStreak = snapshot.weakSpots.find((item) => item.label === 'Verlustserie')
  const processAnchor = snapshot.tagRadar.find((item) => item.label === 'Prozess-Anker')

  if (reviewRuleRisk) return 'Vor dem ersten Entry den Regelcheck sichtbar gegenlesen'
  if (reviewStateRisk) return `${cleanLead(reviewStateRisk.value)} früh erkennen und Tempo rausnehmen`
  if (reviewRepeatability) return `${cleanLead(reviewRepeatability.value)} bewusst als Referenz nutzen`
  if (weakSetup) return `${cleanLead(weakSetup.value)} nur mit Bestätigung handeln`
  if (negativeTrigger) return `Vor jedem Entry ${cleanLead(negativeTrigger.value)} gegenprüfen`
  if (lossStreak) return 'Nach zwei roten Trades sofort in den Cooldown gehen'
  if (bestSetup) return `${cleanLead(bestSetup.value)} priorisieren`
  if (processAnchor) return `${cleanLead(processAnchor.value)} replizieren`
  return 'Selektiv bleiben und nur saubere Trigger handeln'
}

function buildWatchword(snapshot: ReviewSnapshot) {
  const reviewState = snapshot.reviewLayer.highlights.find((item) => item.label === 'Dominanter Zustand')
  const risk = snapshot.errorClusters[0] ?? snapshot.weakSpots[0]
  const processAnchor = snapshot.tagRadar.find((item) => item.label === 'Prozess-Anker') ?? snapshot.topPerformers[0]

  if (reviewState?.value) return cleanLead(reviewState.value)
  if (risk?.value) return cleanLead(risk.value)
  if (processAnchor?.value) return cleanLead(processAnchor.value)
  return getReviewPeriodPresetLabel(snapshot)
}

function dedupeSteps(steps: ReviewActionStep[]) {
  const seen = new Set<string>()
  const deduped: ReviewActionStep[] = []

  for (const step of steps) {
    const key = `${step.lane}::${step.title}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(step)
  }

  return deduped.slice(0, 4)
}

export function buildReviewActionPlan(snapshot: ReviewSnapshot): ReviewActionPlan {
  const bestSetup = snapshot.topPerformers.find((item) => item.label === 'Bestes Setup') ?? snapshot.topPerformers[0]
  const bestMarket = snapshot.topPerformers.find((item) => item.label === 'Stärkster Markt')
  const processAnchor = snapshot.tagRadar.find((item) => item.label === 'Prozess-Anker') ?? snapshot.topPerformers[0]
  const weakSetup = snapshot.weakSpots.find((item) => item.label === 'Schwächstes Setup') ?? snapshot.weakSpots[0]
  const negativeTrigger = snapshot.weakSpots.find((item) => item.label === 'Negativer Tag-Trigger')
  const lossStreak = snapshot.weakSpots.find((item) => item.label === 'Verlustserie')
  const driftSignal = snapshot.tagDrift.find((item) => item.tone === 'red') ?? snapshot.tagDrift.find((item) => item.tone === 'orange')
  const mainError = snapshot.errorClusters[0]
  const latestNote = snapshot.noteMoments[0]
  const actionRule = snapshot.playbook[0]
  const secondaryRule = snapshot.playbook[1]
  const focusSuggestion = buildFocusSuggestion(snapshot)
  const watchword = buildWatchword(snapshot)

  const steps: ReviewActionStep[] = []

  const reviewRisk = snapshot.reviewLayer.highlights.find((item) => item.label === 'Regelspur' && item.tone === 'red')
  const reviewStateRisk = snapshot.reviewLayer.highlights.find((item) => item.label === 'Dominanter Zustand' && item.tone === 'red')
  const reviewStrength = snapshot.reviewLayer.highlights.find((item) => item.label === 'Replizierbarkeit' && item.tone === 'emerald')

  if (reviewRisk) {
    steps.push({
      lane: 'Review-Layer',
      title: 'Regelspur vor dem Open sichtbar machen',
      instruction: 'Lege den Regelcheck vor den ersten Entry. Der Review-Layer zeigt, dass nicht das Setup, sondern der Prozess zuerst geschützt werden muss.',
      reason: shortenSentence(reviewRisk.detail),
      tone: 'red',
      href: '/trades',
    })
  } else if (reviewStateRisk) {
    steps.push({
      lane: 'Review-Layer',
      title: `${cleanLead(reviewStateRisk.value)} früh abbremsen`,
      instruction: `Sobald sich ${cleanLead(reviewStateRisk.value)} zeigt, Tempo rausnehmen und nur A-Trigger handeln.`,
      reason: shortenSentence(reviewStateRisk.detail),
      tone: 'red',
      href: '/trades',
    })
  } else if (reviewStrength) {
    steps.push({
      lane: 'Review-Layer',
      title: 'Replizierbare Trades als Referenz öffnen',
      instruction: 'Nutze die Trades mit klarem Ja zur Replizierbarkeit als Vorbild für den ersten sauberen Ablauf des Tages.',
      reason: shortenSentence(reviewStrength.detail),
      tone: 'emerald',
      href: '/trades',
    })
  }

  if (bestSetup) {
    steps.push({
      lane: 'Mehr davon',
      title: `${cleanLead(bestSetup.value)} als Erstwahl`,
      instruction: `Morgen zuerst nach Trades suchen, die wie ${cleanLead(bestSetup.value)} aussehen. Alles andere bleibt B-Ware, bis der Kernflow steht.`,
      reason: shortenSentence(bestSetup.detail),
      tone: 'emerald',
      href: bestSetup.href,
    })
  } else if (bestMarket) {
    steps.push({
      lane: 'Mehr davon',
      title: `${cleanLead(bestMarket.value)} bewusst priorisieren`,
      instruction: `Richte die erste Aufmerksamkeit auf ${cleanLead(bestMarket.value)} und halte den Rest klein, bis der Tag Struktur zeigt.`,
      reason: shortenSentence(bestMarket.detail),
      tone: 'emerald',
      href: bestMarket.href,
    })
  }

  if (mainError || negativeTrigger || weakSetup) {
    const risk = mainError ?? negativeTrigger ?? weakSetup
    steps.push({
      lane: 'Schützen',
      title: `Stopp-Schild für ${cleanLead(risk.value)}`,
      instruction: `Taucht ${cleanLead(risk.value)} im Pre-Trade-Check auf, dann Size down, Bestätigung abwarten oder komplett skippen.`,
      reason: shortenSentence(risk.detail),
      tone: risk === mainError ? 'red' : 'orange',
      href: risk.href,
    })
  }

  if (processAnchor || actionRule) {
    const anchorTitle = processAnchor ? cleanLead(processAnchor.value) : 'dein sauberster Ablauf'
    steps.push({
      lane: 'Replizieren',
      title: processAnchor ? `${anchorTitle} als Prozess-Anker` : 'Den besten Ablauf kopieren',
      instruction: actionRule ? shortenSentence(actionRule, 160) : `Vor dem ersten Entry prüfen, ob das Setup denselben ruhigen Zustand wie ${anchorTitle} hat.`,
      reason: processAnchor ? shortenSentence(processAnchor.detail) : 'Das Review markiert hier den Ablauf, den du öfter sehen willst.',
      tone: processAnchor ? 'emerald' : 'orange',
      href: processAnchor?.href,
    })
  }

  if (lossStreak || driftSignal || latestNote) {
    const guardrail = lossStreak ?? driftSignal
    steps.push({
      lane: 'Morgen-Notiz',
      title: latestNote ? latestNote.title : 'Review in den nächsten Tag tragen',
      instruction: latestNote
        ? `Starte den Tag mit dem Fokus „${focusSuggestion}“ und lies die letzte Note noch einmal, bevor du aktiv wirst.`
        : `Schreibe „${focusSuggestion}“ als Fokus für morgen in die Daily Note, damit der Review-Impuls nicht bis zum Open verdunstet.`,
      reason: latestNote ? shortenSentence(latestNote.body) : guardrail ? shortenSentence(guardrail.detail) : 'Ein sichtbarer Fokus verhindert, dass das Review nur nett gelesen, aber nicht gehandelt wird.',
      tone: lossStreak ? 'red' : driftSignal?.tone === 'red' ? 'red' : 'orange',
      href: `/daily-note?focus=${encodeURIComponent(focusSuggestion)}`,
    })
  }

  const dedupedSteps = dedupeSteps(steps)
  const redSteps = dedupedSteps.filter((step) => step.tone === 'red').length

  const headline = redSteps > 0
    ? 'Aus dem Review wird jetzt ein Schutzplan für morgen'
    : dedupedSteps.some((step) => step.tone === 'emerald')
      ? 'Aus dem Review wird jetzt ein Fokusplan für morgen'
      : 'Aus dem Review wird jetzt ein klarer Arbeitsplan für morgen'

  const summary = redSteps > 0
    ? `Nicht mehr Input, sondern bessere Auswahl: ${focusSuggestion}. Das Review zeigt klar, wo du bremsen und wo du replizieren solltest.`
    : `Das Review liefert keinen Roman, sondern eine kleine Agenda: ${focusSuggestion}. So wird aus Rückblick echte Vorbereitung.`

  const checklist = Array.from(new Set([
    focusSuggestion,
    ...snapshot.reviewLayer.checklist,
    actionRule ? shortenSentence(actionRule, 110) : null,
    secondaryRule ? shortenSentence(secondaryRule, 110) : null,
    mainError ? `Vor Entry auf ${cleanLead(mainError.value)} prüfen` : null,
    processAnchor ? `${cleanLead(processAnchor.value)} als Referenz offen halten` : null,
  ].filter(Boolean) as string[])).slice(0, 4)

  return {
    headline,
    summary,
    dailyFocusSuggestion: focusSuggestion,
    watchword,
    steps: dedupedSteps,
    checklist,
  }
}
