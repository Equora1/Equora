import { journalText, type JournalLocale } from '@/lib/i18n/journal'
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

function buildFocusSuggestion(snapshot: ReviewSnapshot, locale: JournalLocale) {
  const text = journalText(locale)
  const reviewRuleRisk = snapshot.reviewLayer.highlights.find((item) => item.label === 'Regelspur' && item.tone === 'red')
  const reviewStateRisk = snapshot.reviewLayer.highlights.find((item) => item.label === 'Dominanter Zustand' && item.tone === 'red')
  const reviewRepeatability = snapshot.reviewLayer.highlights.find((item) => item.label === 'Replizierbarkeit' && item.tone === 'emerald')
  const bestSetup = snapshot.topPerformers.find((item) => item.label === 'Bestes Setup') ?? snapshot.topPerformers[0]
  const weakSetup = snapshot.weakSpots.find((item) => item.label === 'Schwächstes Setup')
  const negativeTrigger = snapshot.weakSpots.find((item) => item.label === 'Negativer Tag-Trigger')
  const lossStreak = snapshot.weakSpots.find((item) => item.label === 'Verlustserie')
  const processAnchor = snapshot.tagRadar.find((item) => item.label === 'Prozess-Anker')

  if (reviewRuleRisk) return text('Vor dem ersten Einstieg den Regelcheck sichtbar gegenlesen', 'Review your rules before the first entry')
  if (reviewStateRisk) return text(`${cleanLead(reviewStateRisk.value)} früh erkennen und Tempo rausnehmen`, `Spot ${cleanLead(reviewStateRisk.value)} early and slow down`)
  if (reviewRepeatability) return text(`${cleanLead(reviewRepeatability.value)} bewusst als Referenz nutzen`, `Use ${cleanLead(reviewRepeatability.value)} as a reference`)
  if (weakSetup) return text(`${cleanLead(weakSetup.value)} nur mit Bestätigung handeln`, `Wait for confirmation on ${cleanLead(weakSetup.value)}`)
  if (negativeTrigger) return text(`Vor jedem Einstieg ${cleanLead(negativeTrigger.value)} gegenprüfen`, `Check for ${cleanLead(negativeTrigger.value)} before each entry`)
  if (lossStreak) return text('Nach zwei Verlusttrades eine Handelspause einlegen', 'Take a break after two losing trades')
  if (bestSetup) return text(`${cleanLead(bestSetup.value)} priorisieren`, `Prioritise ${cleanLead(bestSetup.value)}`)
  if (processAnchor) return text(`${cleanLead(processAnchor.value)} gezielt nachbereiten`, `Review trades tagged ${cleanLead(processAnchor.value)}`)
  return text('Selektiv bleiben und nur saubere Trigger handeln', 'Trade only when your entry criteria are met')
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

export function buildReviewActionPlan(snapshot: ReviewSnapshot, locale: JournalLocale = 'de'): ReviewActionPlan {
  const text = journalText(locale)
  if (snapshot.sessionDraft.monetaryScopeKind !== 'single') {
    const hasTrades = snapshot.sessionDraft.tradeCount > 0
    const kind = snapshot.sessionDraft.monetaryScopeKind
    const focus = !hasTrades ? text('Trades für diesen Zeitraum erfassen', 'Record trades for this period')
      : kind === 'mixed' ? text('Trades nach Währung trennen', 'Group trades by currency')
      : kind === 'unknown' ? text('Währungsangaben prüfen', 'Check trade currencies') : text('Ergebnisse ergänzen', 'Add the missing results')
    const instruction = !hasTrades ? text('Erfasse einen Trade, damit du ihn anschließend nachbereiten kannst.', 'Add a trade so you can review it later.')
      : kind === 'mixed' ? text('Filtere nach einer Währung, bevor du Geldbeträge vergleichst.', 'Filter to one currency before comparing money amounts.')
      : kind === 'unknown' ? text('Prüfe die Währung deiner Ergebnisse anhand deiner Konto- oder Brokerunterlagen.', 'Check the currency in your account or broker records.')
      : text('Ergänze die fehlenden Ergebnisse anhand deiner Aufzeichnungen.', 'Use your records to add the missing results.')
    return {
      headline: text('Review vorbereiten', 'Prepare your review'),
      summary: snapshot.summary,
      dailyFocusSuggestion: focus,
      watchword: focus,
      steps: [{ lane: text('Nächster Schritt', 'Next step'), title: focus, instruction, reason: snapshot.summary, tone: 'orange', href: '/trades' }],
      checklist: [focus, ...(hasTrades ? [text('Deine Entscheidungen und Notizen nachbereiten', 'Review your decisions and notes')] : [])],
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
  const focusSuggestion = buildFocusSuggestion(snapshot, locale)
  const watchword = buildWatchword(snapshot)

  const steps: ReviewActionStep[] = []

  const reviewRisk = snapshot.reviewLayer.highlights.find((item) => item.label === 'Regelspur' && item.tone === 'red')
  const reviewStateRisk = snapshot.reviewLayer.highlights.find((item) => item.label === 'Dominanter Zustand' && item.tone === 'red')
  const reviewStrength = snapshot.reviewLayer.highlights.find((item) => item.label === 'Replizierbarkeit' && item.tone === 'emerald')

  if (reviewRisk) {
    steps.push({
      lane: text('Verhaltensprüfung', 'Behaviour'),
      title: text('Regelcheck sichtbar machen', 'Keep your rules in view'),
      instruction: text('Prüfe deine Regeln vor dem ersten Einstieg.', 'Check your rules before the first entry.'),
      reason: shortenSentence(reviewRisk.detail),
      tone: 'red',
      href: '/trades',
    })
  } else if (reviewStateRisk) {
    steps.push({
      lane: text('Verhaltensprüfung', 'Behaviour'),
      title: text(`${cleanLead(reviewStateRisk.value)} früh abbremsen`, `Slow down when ${cleanLead(reviewStateRisk.value)} appears`),
      instruction: text(`Sobald sich ${cleanLead(reviewStateRisk.value)} zeigt, eine Pause einlegen und neue Einstiege an deinen Setup-Regeln prüfen.`, `If ${cleanLead(reviewStateRisk.value)} appears, take a break and check your setup rules before entering again.`),
      reason: shortenSentence(reviewStateRisk.detail),
      tone: 'red',
      href: '/trades',
    })
  } else if (reviewStrength) {
    steps.push({
      lane: text('Verhaltensprüfung', 'Behaviour'),
      title: text('Beste Trades öffnen', 'Open your best trades'),
      instruction: text('Beste Trades als Referenz öffnen.', 'Use your best trades as a reference.'),
      reason: shortenSentence(reviewStrength.detail),
      tone: 'emerald',
      href: '/trades',
    })
  }

  if (bestSetup) {
    steps.push({
      lane: text('Mehr', 'Build on strengths'),
      title: text(`${cleanLead(bestSetup.value)} als Erstwahl`, `Start with ${cleanLead(bestSetup.value)}`),
      instruction: text(`Morgen zuerst nach Trades suchen, die wie ${cleanLead(bestSetup.value)} aussehen. Vergleiche andere Trades zuerst mit diesem Ablauf.`, `Review what worked in ${cleanLead(bestSetup.value)} and compare other setups with that process.`),
      reason: shortenSentence(bestSetup.detail),
      tone: 'emerald',
      href: bestSetup.href,
    })
  } else if (bestMarket) {
    steps.push({
      lane: text('Mehr', 'Build on strengths'),
      title: text(`${cleanLead(bestMarket.value)} bewusst priorisieren`, `Prioritise ${cleanLead(bestMarket.value)}`),
      instruction: text(`Zuerst achten auf ${cleanLead(bestMarket.value)}.`, `Start by reviewing ${cleanLead(bestMarket.value)}.`),
      reason: shortenSentence(bestMarket.detail),
      tone: 'emerald',
      href: bestMarket.href,
    })
  }

  if (mainError || negativeTrigger || weakSetup) {
    const risk = mainError ?? negativeTrigger ?? weakSetup
    steps.push({
      lane: text('Schutz', 'Manage risk'),
      title: text(`Stopp-Schild für ${cleanLead(risk.value)}`, `Plan for ${cleanLead(risk.value)}`),
      instruction: text(`Taucht ${cleanLead(risk.value)} bei der Vorbereitung auf, prüfe eine kleinere Positionsgröße, warte auf Bestätigung oder lasse den Trade aus.`, `If you see ${cleanLead(risk.value)}, review your position size and entry criteria.`),
      reason: shortenSentence(risk.detail),
      tone: risk === mainError ? 'red' : 'orange',
      href: risk.href,
    })
  }

  if (processAnchor || actionRule) {
    const anchorTitle = processAnchor ? cleanLead(processAnchor.value) : text('dein sauberster Ablauf', 'your most consistent process')
    steps.push({
      lane: text('Wiederholen', 'Repeat'),
      title: processAnchor ? text(`Ablauf hinter ${anchorTitle} prüfen`, `Review the process behind ${anchorTitle}`) : text('Den besten Ablauf kopieren', 'Repeat the process that worked best'),
      instruction: actionRule ? shortenSentence(actionRule, 160) : text(`Vor dem ersten Einstieg prüfen: ${anchorTitle}`, `Before your first entry, review ${anchorTitle}`),
      reason: processAnchor ? shortenSentence(processAnchor.detail) : text('Das Review markiert hier den Ablauf, den du öfter sehen willst.', 'Use your strongest trades to identify a process you can repeat.'),
      tone: processAnchor ? 'emerald' : 'orange',
      href: processAnchor?.href,
    })
  }

  if (lossStreak || driftSignal || latestNote) {
    const guardrail = lossStreak ?? driftSignal
    steps.push({
      lane: text('Morgen', 'Tomorrow'),
      title: latestNote ? latestNote.title : text('Review in den nächsten Tag tragen', 'Carry this review into your next session'),
      instruction: text(`Fokus: „${focusSuggestion}“.`, `Focus: ${focusSuggestion}.`),
      reason: latestNote ? shortenSentence(latestNote.body) : guardrail ? shortenSentence(guardrail.detail) : text('Ein sichtbarer Fokus verhindert, dass das Review nur nett gelesen, aber nicht gehandelt wird.', 'Keep your focus visible in the next session.'),
      tone: lossStreak ? 'red' : driftSignal?.tone === 'red' ? 'red' : 'orange',
      href: '/trades',
    })
  }

  const dedupedSteps = dedupeSteps(steps)
  const redSteps = dedupedSteps.filter((step) => step.tone === 'red').length

  const headline = text('Plan für morgen', 'Plan for tomorrow')

  const summary = redSteps > 0
    ? text(`${focusSuggestion}. Prüfe die markierten Entscheidungen und leite daraus einen konkreten nächsten Schritt ab.`, `${focusSuggestion}. Review the highlighted decisions and pick one next step.`)
    : `${focusSuggestion}.`

  const checklist = Array.from(new Set([
    focusSuggestion,
    ...snapshot.reviewLayer.checklist,
    actionRule ? shortenSentence(actionRule, 110) : null,
    secondaryRule ? shortenSentence(secondaryRule, 110) : null,
    mainError ? text(`Vor dem Einstieg auf ${cleanLead(mainError.value)} prüfen`, `Check for ${cleanLead(mainError.value)} before entering`) : null,
    processAnchor ? text(`${cleanLead(processAnchor.value)} als Referenz offen halten`, `Keep ${cleanLead(processAnchor.value)} open as a reference`) : null,
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
