const beforeQuestions = ['recovery', 'focus', 'previous_emotions', 'trading_pressure'] as const
const afterQuestions = ['confidence', 'plan_adherence'] as const

export const checkInPhases = ['before', 'after'] as const
export const checkInRatings = [1, 2, 3, 4, 5] as const
export const checkInQuestions = [...beforeQuestions, ...afterQuestions, 'entry_signal'] as const

export type CheckInPhase = (typeof checkInPhases)[number]
export type CheckInRating = (typeof checkInRatings)[number]
export type CheckInQuestion = (typeof checkInQuestions)[number]
export type CheckInDraft = {
  answers: Partial<Record<CheckInQuestion, CheckInRating>>
  noTrades: boolean
}
export type TradingCheckInDay = Record<CheckInPhase, CheckInDraft | null>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCheckInRating(value: unknown): value is CheckInRating {
  return checkInRatings.some((rating) => rating === value)
}

export function isCheckInPhase(value: unknown): value is CheckInPhase {
  return value === 'before' || value === 'after'
}

function hasPlanDeviation(answers: CheckInDraft['answers']) {
  return answers.plan_adherence !== undefined && answers.plan_adherence < 5
}

export function getCheckInQuestions(phase: CheckInPhase, draft: CheckInDraft): readonly CheckInQuestion[] {
  if (phase === 'before') return beforeQuestions
  if (draft.noTrades) return []
  return hasPlanDeviation(draft.answers) ? [...afterQuestions, 'entry_signal'] : afterQuestions
}

export function parseCheckInDraft(phase: CheckInPhase, value: unknown): CheckInDraft | null {
  if (!isRecord(value) || Object.keys(value).length !== 2 || !isRecord(value.answers) || typeof value.noTrades !== 'boolean') {
    return null
  }

  const possibleQuestions: readonly string[] = phase === 'before' ? beforeQuestions : [...afterQuestions, 'entry_signal']
  const answers: CheckInDraft['answers'] = {}
  for (const [question, answer] of Object.entries(value.answers)) {
    if (!possibleQuestions.includes(question) || !isCheckInRating(answer)) return null
    answers[question as CheckInQuestion] = answer
  }

  if (value.noTrades && (phase !== 'after' || Object.keys(answers).length > 0)) return null
  if (answers.entry_signal !== undefined && !hasPlanDeviation(answers)) return null
  return { answers, noTrades: value.noTrades }
}

export function hasCheckInContent(draft: CheckInDraft) {
  return draft.noTrades || Object.keys(draft.answers).length > 0
}

export function changeCheckInAnswer(draft: CheckInDraft, question: CheckInQuestion, value: CheckInRating | null): CheckInDraft {
  const answers = { ...draft.answers }
  if (value === null) delete answers[question]
  else answers[question] = value
  if (!hasPlanDeviation(answers)) delete answers.entry_signal
  return { answers, noTrades: false }
}

export function checkInColumns(draft: CheckInDraft) {
  return {
    recovery: draft.answers.recovery ?? null,
    focus: draft.answers.focus ?? null,
    previous_emotions: draft.answers.previous_emotions ?? null,
    trading_pressure: draft.answers.trading_pressure ?? null,
    confidence: draft.answers.confidence ?? null,
    plan_adherence: draft.answers.plan_adherence ?? null,
    entry_signal: draft.answers.entry_signal ?? null,
    no_trades: draft.noTrades,
  }
}

export function readCheckInRow(phase: CheckInPhase, row: unknown): CheckInDraft | null {
  if (!isRecord(row) || row.phase !== phase) return null
  const answers: Record<string, unknown> = {}
  for (const question of checkInQuestions) {
    if (row[question] !== null) answers[question] = row[question]
  }
  const draft = parseCheckInDraft(phase, { answers, noTrades: row.no_trades })
  return draft && hasCheckInContent(draft) ? draft : null
}
