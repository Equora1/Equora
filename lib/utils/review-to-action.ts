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

  if (reviewRuleRisk) return 'Vor dem ersten Einstieg den Regelcheck sichtbar gegenlesen'
  if (reviewStateRisk) return `${cleanLead(reviewStateRisk.value)} früh erkennen und Tempo rausnehmen`
  if (reviewRepeatability) return `${cleanLead(reviewRepeatability.value)} bewusst als Referenz nutzen`
  if (weakSetup) return `${cleanLead(weakSetup.value)} nur mit Bestätigung handeln`
  if (negativeTrigger) return `Vor jedem Einstieg ${cleanLead(negativeTrigger.value)} gegenprüfen`
  if (lossStreak) return 'Nach zwei Verlusttrades eine Handelspause einlegen'
  if (bestSetup) return `${cleanLead(bestSetup.value)} priorisieren`
  if (processAnchor) return `${cleanLead(processAnchor.value)} gezielt nachbereiten`
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
  if (snapshot.sessionDraft.monetaryScopeKind !== 'single') {
    const hasTrades = snapshot.sessionDraft.tradeCount > 0
    const kind = snapshot.sessionDraft.monetaryScopeKind
    const focus = !hasTrades ? 'Trades für diesen Zeitraum erfassen'
      : kind === 'mixed' ? 'Trades nach Währung trennen'
      : kind === 'unknown' ? 'Währungsangaben prüfen' : 'Ergebnisse ergänzen'
    const instruction = !hasTrades ? 'Erfasse einen Trade, damit du ihn anschließend nachbereiten kannst.'
      : kind === 'mixed' ? 'Filtere nach einer Währung, bevor du Geldbeträge vergleichst.'
      : kind === 'unknown' ? 'Prüfe die Währung deiner Ergebnisse anhand deiner Konto- oder Brokerunterlagen.'
      : 'Ergänze die fehlenden Ergebnisse anhand deiner Aufzeichnungen.'
    return {
      headline: 'Review vorbereiten',
      summary: snapshot.summary,
      dailyFocusSuggestion: focus,
      watchword: focus,
      steps: [{ lane: 'Nächster Schritt', title: focus, instruction, reason: snapshot.summary, tone: 'orange', href: '/trades' }],
      checklist: [focus, ...(hasTrades ? ['Deine Entscheidungen und Notizen nachbereiten'] : [])],
    }
  }

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
      lane: 'Verhaltensprüfung',
      title: 'Regelcheck sichtbar machen',
      instruction: 'Prüfe deine Regeln vor dem ersten Einstieg.',
      reason: shortenSentence(reviewRisk.detail),
      tone: 'red',
      href: '/trades',
    })
  } else if (reviewStateRisk) {
    steps.push({
      lane: 'Verhaltensprüfung',
      title: `${cleanLead(reviewStateRisk.value)} früh abbremsen`,
      instruction: `Sobald sich ${cleanLead(reviewStateRisk.value)} zeigt, eine Pause einlegen und neue Einstiege an deinen Setup-Regeln prüfen.`,
      reason: shortenSentence(reviewStateRisk.detail),
      tone: 'red',
      href: '/trades',
    })
  } else if (reviewStrength) {
    steps.push({
      lane: 'Verhaltensprüfung',
      title: 'Beste Trades öffnen',
      instruction: 'Beste Trades als Referenz öffnen.',
      reason: shortenSentence(reviewStrength.detail),
      tone: 'emerald',
      href: '/trades',
    })
  }

  if (bestSetup) {
    steps.push({
      lane: 'Mehr',
      title: `${cleanLead(bestSetup.value)} als Erstwahl`,
      instruction: `Morgen zuerst nach Trades suchen, die wie ${cleanLead(bestSetup.value)} aussehen. Vergleiche andere Trades zuerst mit diesem Ablauf.`,
      reason: shortenSentence(bestSetup.detail),
      tone: 'emerald',
      href: bestSetup.href,
    })
  } else if (bestMarket) {
    steps.push({
      lane: 'Mehr',
      title: `${cleanLead(bestMarket.value)} bewusst priorisieren`,
      instruction: `Zuerst achten auf ${cleanLead(bestMarket.value)}.`,
      reason: shortenSentence(bestMarket.detail),
      tone: 'emerald',
      href: bestMarket.href,
    })
  }

  if (mainError || negativeTrigger || weakSetup) {
    const risk = mainError ?? negativeTrigger ?? weakSetup
    steps.push({
      lane: 'Schutz',
      title: `Stopp-Schild für ${cleanLead(risk.value)}`,
      instruction: `Taucht ${cleanLead(risk.value)} bei der Vorbereitung auf, prüfe eine kleinere Positionsgröße, warte auf Bestätigung oder lasse den Trade aus.`,
      reason: shortenSentence(risk.detail),
      tone: risk === mainError ? 'red' : 'orange',
      href: risk.href,
    })
  }

  if (processAnchor || actionRule) {
    const anchorTitle = processAnchor ? cleanLead(processAnchor.value) : 'dein sauberster Ablauf'
    steps.push({
      lane: 'Wiederholen',
      title: processAnchor ? `Ablauf hinter ${anchorTitle} prüfen` : 'Den besten Ablauf kopieren',
      instruction: actionRule ? shortenSentence(actionRule, 160) : `Vor dem ersten Einstieg prüfen: ${anchorTitle}`,
      reason: processAnchor ? shortenSentence(processAnchor.detail) : 'Das Review markiert hier den Ablauf, den du öfter sehen willst.',
      tone: processAnchor ? 'emerald' : 'orange',
      href: processAnchor?.href,
    })
  }

  if (lossStreak || driftSignal || latestNote) {
    const guardrail = lossStreak ?? driftSignal
    steps.push({
      lane: 'Morgen',
      title: latestNote ? latestNote.title : 'Review in den nächsten Tag tragen',
      instruction: latestNote
        ? `Fokus: „${focusSuggestion}“.`
        : `Fokus: „${focusSuggestion}“.`,
      reason: latestNote ? shortenSentence(latestNote.body) : guardrail ? shortenSentence(guardrail.detail) : 'Ein sichtbarer Fokus verhindert, dass das Review nur nett gelesen, aber nicht gehandelt wird.',
      tone: lossStreak ? 'red' : driftSignal?.tone === 'red' ? 'red' : 'orange',
      href: `/trades?reviewFocus=${encodeURIComponent(focusSuggestion)}`,
    })
  }

  const dedupedSteps = dedupeSteps(steps)
  const redSteps = dedupedSteps.filter((step) => step.tone === 'red').length

  const headline = redSteps > 0
    ? 'Plan für morgen'
    : dedupedSteps.some((step) => step.tone === 'emerald')
      ? 'Plan für morgen'
      : 'Plan für morgen'

  const summary = redSteps > 0
    ? `${focusSuggestion}. Prüfe die markierten Entscheidungen und leite daraus einen konkreten nächsten Schritt ab.`
    : `${focusSuggestion}.`

  const checklist = Array.from(new Set([
    focusSuggestion,
    ...snapshot.reviewLayer.checklist,
    actionRule ? shortenSentence(actionRule, 110) : null,
    secondaryRule ? shortenSentence(secondaryRule, 110) : null,
    mainError ? `Vor dem Einstieg auf ${cleanLead(mainError.value)} prüfen` : null,
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
