import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { formatCurrency, formatPlainNumber } from '@/lib/utils/calculations'
import { getCalendarTradeDay } from '@/lib/utils/calendar'
import { getTrustedTrades } from '@/lib/utils/trade-trust'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { getMonetaryScopeMessage, type MonetaryScope } from '@/lib/utils/currency'

export const DAILY_NOTE_MOODS = [
  'Kontrolliert',
  'Fokussiert',
  'Ruhig',
  'Angespannt',
  'Frustriert',
  'Selbstbewusst',
  'Müde',
  'Neugierig',
] as const

export const DAILY_NOTE_FOCUS_PRESETS = [
  'Geduld > Aktivität',
  'Confirmation vor Entry',
  'A-Setups priorisieren',
  'Risikoklarheit halten',
  'Nicht chasen',
  'Nach Exit sauber reviewen',
] as const

const englishDailyFocus: Record<(typeof DAILY_NOTE_FOCUS_PRESETS)[number], string> = {
  'Geduld > Aktivität': 'Prioritise patience',
  'Confirmation vor Entry': 'Wait for confirmation before entering',
  'A-Setups priorisieren': 'Prioritise A setups',
  'Risikoklarheit halten': 'Define risk before entering',
  'Nicht chasen': 'Avoid chasing the price',
  'Nach Exit sauber reviewen': 'Review the trade after exiting',
}

const englishMoods: Record<DailyMoodOption, string> = {
  Kontrolliert: 'In control',
  Fokussiert: 'Focused',
  Ruhig: 'Calm',
  Angespannt: 'Tense',
  Frustriert: 'Frustrated',
  Selbstbewusst: 'Confident',
  Müde: 'Tired',
  Neugierig: 'Curious',
}

export function getDailyMoodLabel(mood: string, locale: JournalLocale) {
  return locale === 'en' && Object.hasOwn(englishMoods, mood) ? englishMoods[mood as DailyMoodOption] : mood
}

export const DAILY_FOCUS_STATUS_OPTIONS = ['eingehalten', 'teilweise', 'nicht gehalten'] as const

export type DailyMoodOption = (typeof DAILY_NOTE_MOODS)[number]
export type DailyFocusStatus = (typeof DAILY_FOCUS_STATUS_OPTIONS)[number]

export type ParsedDailyNoteStorage = {
  visibleNote: string
  focusStatus: DailyFocusStatus | null
  focusReflection: string | null
}

export type DailyFocusBridge = {
  todayDateKey: string
  carryDateKey: string
  carryFocus: string | null
  carryStatus: DailyFocusStatus | null
  carryReflection: string | null
  tomorrowFocus: string | null
}

export type DailyNoteFlowSummary = {
  dateKey: string
  existingNote: DailyNoteRow | null
  dayTrades: Trade[]
  trustedTrades: Trade[]
  completeTrades: number
  incompleteTrades: number
  totalTrades: number
  trustedPnL: number
  monetaryScope: MonetaryScope
  averageR: number | null
  winCount: number
  lossCount: number
  trustedCoverage: number
  dominantSetup: string | null
  strongestEmotion: string | null
  tone: 'emerald' | 'red' | 'orange'
  headline: string
  copy: string
  titleSuggestion: string
  noteStarter: string
  reviewHint: string
  prompts: string[]
  focusSuggestions: string[]
}

const FOCUS_STATUS_MARKER = /<!--\s*equora:focus-status=([^>]*)-->/i
const FOCUS_REFLECTION_MARKER = /<!--\s*equora:focus-reflection=([^>]*)-->/i

export function getBerlinTodayDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function getDailyNoteByDate(dailyNotes: DailyNoteRow[], dateKey: string) {
  return dailyNotes.find((note) => note.trade_date === dateKey) ?? null
}

export function parseDailyNoteStorage(note: string | null | undefined): ParsedDailyNoteStorage {
  const raw = note?.trim() ?? ''
  if (!raw) return { visibleNote: '', focusStatus: null, focusReflection: null }

  const statusMatch = raw.match(FOCUS_STATUS_MARKER)
  const reflectionMatch = raw.match(FOCUS_REFLECTION_MARKER)
  const normalizedStatus = (statusMatch?.[1]?.trim() ?? '') as DailyFocusStatus | ''
  const focusStatus = DAILY_FOCUS_STATUS_OPTIONS.includes(normalizedStatus as DailyFocusStatus)
    ? (normalizedStatus as DailyFocusStatus)
    : null
  const focusReflection = decodeMarkerValue(reflectionMatch?.[1])

  const visibleNote = raw
    .replace(FOCUS_STATUS_MARKER, '')
    .replace(FOCUS_REFLECTION_MARKER, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    visibleNote,
    focusStatus,
    focusReflection: focusReflection || null,
  }
}

export function composeDailyNoteStorage(
  visibleNote: string | null | undefined,
  meta?: { focusStatus?: DailyFocusStatus | null; focusReflection?: string | null },
) {
  const fragments = [visibleNote?.trim() ?? ''].filter(Boolean)
  const focusStatus = meta?.focusStatus ?? null
  const focusReflection = meta?.focusReflection?.trim() || null

  if (focusStatus) fragments.push(`<!-- equora:focus-status=${focusStatus}-->`)
  if (focusReflection) fragments.push(`<!-- equora:focus-reflection=${encodeMarkerValue(focusReflection)}-->`)

  const result = fragments.join('\n\n').trim()
  return result || null
}

export function getPreviousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

export function buildDailyFocusBridge(dailyNotes: DailyNoteRow[], dateKey = getBerlinTodayDateKey()): DailyFocusBridge {
  const todayNote = getDailyNoteByDate(dailyNotes, dateKey)
  const carryDateKey = getPreviousDateKey(dateKey)
  const carryNote = getDailyNoteByDate(dailyNotes, carryDateKey)
  const todayMeta = parseDailyNoteStorage(todayNote?.note)

  return {
    todayDateKey: dateKey,
    carryDateKey,
    carryFocus: carryNote?.focus?.trim() || null,
    carryStatus: todayMeta.focusStatus,
    carryReflection: todayMeta.focusReflection,
    tomorrowFocus: todayNote?.focus?.trim() || null,
  }
}

function getDominantValue(values: string[]) {
  const grouped = values.reduce<Record<string, number>>((accumulator, value) => {
    const normalized = value.trim()
    if (!normalized || normalized === '—') return accumulator
    accumulator[normalized] = (accumulator[normalized] ?? 0) + 1
    return accumulator
  }, {})

  return Object.entries(grouped).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
}

function buildHeadline(totalTrades: number, trustedPnL: number, trustedCoverage: number, monetaryScope: MonetaryScope, locale: JournalLocale) {
  const text = journalText(locale)
  if (totalTrades === 0) return text('Kein Handelstag, aber trotzdem ein wertvoller Tagesabschluss.', 'No trades for this day.')
  if (!monetaryScope.isComparable && monetaryScope.kind !== 'empty') return text('Trades vorhanden, Geld-Auswertung wegen der Währungsdaten gesperrt.', 'Daily P&L is unavailable because of the currency data.')
  if (trustedPnL > 0) return text(`${totalTrades} Trade${totalTrades === 1 ? '' : 's'} im Journal. Die berücksichtigten Abschlüsse liegen im Plus.`, `${totalTrades} ${totalTrades === 1 ? 'trade' : 'trades'} recorded. The included results were positive.`)
  if (trustedPnL < 0) return text(`${totalTrades} Trade${totalTrades === 1 ? '' : 's'} im Journal. Die berücksichtigten Abschlüsse liegen im Minus.`, `${totalTrades} ${totalTrades === 1 ? 'trade' : 'trades'} recorded. The included results were negative.`)
  if (trustedCoverage < 100) return text(`${totalTrades} Trade${totalTrades === 1 ? '' : 's'} im Journal. Für die vollständige Tagesauswertung fehlen noch Angaben.`, `${totalTrades} ${totalTrades === 1 ? 'trade' : 'trades'} recorded. Some details are missing.`)
  return text(`${totalTrades} Trade${totalTrades === 1 ? '' : 's'} im Journal. Die berücksichtigten Abschlüsse ergeben zusammen null.`, `${totalTrades} ${totalTrades === 1 ? 'trade' : 'trades'} recorded. The included results broke even.`)
}

function buildCopy(totalTrades: number, incompleteTrades: number, dominantSetup: string | null, strongestEmotion: string | null, locale: JournalLocale) {
  const text = journalText(locale)
  if (totalTrades === 0) {
    return text('Auch ohne Trade kannst du festhalten, was du beobachtet und warum du auf einen Einstieg verzichtet hast.', 'Record what you observed and why you chose to stay out.')
  }

  const fragments = [
    dominantSetup ? text(`Setup-Fokus heute: ${dominantSetup}.`, `Main setup: ${dominantSetup}.`) : null,
    strongestEmotion ? text(`Emotion im Vordergrund: ${strongestEmotion}.`, `Most common emotion: ${getDailyMoodLabel(strongestEmotion, locale)}.`) : null,
    incompleteTrades > 0 ? text(`${incompleteTrades} Schnellerfassung${incompleteTrades === 1 ? '' : 'en'} noch zu vervollständigen.`, `${incompleteTrades} quick ${incompleteTrades === 1 ? 'entry needs' : 'entries need'} details.`) : null,
  ].filter(Boolean)

  return fragments.join(' ') || text('Halte kurz fest, welche Entscheidungen gut waren und was du beim nächsten Mal anders machen möchtest.', 'Record what worked and what you would change next time.')
}

function buildTitleSuggestion(dateKey: string, trustedPnL: number, dominantSetup: string | null, locale: JournalLocale) {
  const text = journalText(locale)
  if (dominantSetup && trustedPnL > 0) return text(`${dominantSetup} sauber gespielt`, `${dominantSetup} review`)
  if (dominantSetup && trustedPnL < 0) return text(`${dominantSetup} mit Lernmoment`, `Lessons from ${dominantSetup}`)
  if (trustedPnL > 0) return text(`Solider Handelstag ${dateKey}`, `Trading day ${dateKey}`)
  if (trustedPnL < 0) return text(`Review-Tag ${dateKey}`, `Trading review ${dateKey}`)
  return text(`Tagesabschluss ${dateKey}`, `Daily note ${dateKey}`)
}

function buildNoteStarter(input: {
  totalTrades: number
  trustedPnL: number
  averageR: number | null
  dominantSetup: string | null
  strongestEmotion: string | null
  incompleteTrades: number
  monetaryScope: MonetaryScope
}, locale: JournalLocale) {
  const text = journalText(locale)
  const { totalTrades, trustedPnL, averageR, dominantSetup, strongestEmotion, incompleteTrades, monetaryScope } = input

  if (totalTrades === 0) {
    return text('Heute kein Trade. Marktbeobachtung, Fokus und Disziplin trotzdem kurz festhalten.', 'No trades today. What did you notice about the market or your decisions?')
  }

  const lines = [
    text(`Heute standen ${totalTrades} Trade${totalTrades === 1 ? '' : 's'} im Journal.${dominantSetup ? ` Das prägende Setup war ${dominantSetup}.` : ''}`, `${totalTrades} ${totalTrades === 1 ? 'trade' : 'trades'} recorded.${dominantSetup ? ` Main setup: ${dominantSetup}.` : ''}`),
    monetaryScope.isComparable
      ? text(`Belastbare P&L: ${formatCurrency(trustedPnL, 0, monetaryScope.currency, locale)}${averageR !== null && Number.isFinite(averageR) ? ` bei Ø ${formatPlainNumber(averageR, 2, locale)}R.` : '.'}`, `Included P&L: ${formatCurrency(trustedPnL, 0, monetaryScope.currency, locale)}${averageR !== null && Number.isFinite(averageR) ? ` with an average of ${formatPlainNumber(averageR, 2, locale)}R.` : '.'}`)
      : getMonetaryScopeMessage(monetaryScope, locale),
    strongestEmotion ? text(`Emotional war der Tag vor allem ${strongestEmotion.toLowerCase()}.`, `Most common emotion: ${getDailyMoodLabel(strongestEmotion, locale)}.`) : null,
    incompleteTrades > 0 ? text(`${incompleteTrades} Schnellerfassung${incompleteTrades === 1 ? '' : 'en'} sollte${incompleteTrades === 1 ? '' : 'n'} noch vervollständigt werden.`, `${incompleteTrades} quick ${incompleteTrades === 1 ? 'entry needs' : 'entries need'} details.`) : null,
    text('Meine wichtigste Erkenntnis:', 'My main takeaway:')
  ].filter(Boolean)

  return lines.join(' ')
}

export function buildDailyNoteFlowSummary(trades: Trade[], dailyNotes: DailyNoteRow[], dateKey = getBerlinTodayDateKey(), tradeDateKey: (trade: Trade) => string | null = getCalendarTradeDay, locale: JournalLocale = 'de'): DailyNoteFlowSummary {
  const text = journalText(locale)
  const dayTrades = trades.filter((trade) => tradeDateKey(trade) === dateKey)
  const trustedTrades = getTrustedTrades(dayTrades)
  const existingNote = getDailyNoteByDate(dailyNotes, dateKey)
  const parsedExistingNote = parseDailyNoteStorage(existingNote?.note)
  const metrics = getCoreMetrics(trustedTrades)
  const trustedPnL = metrics.netPnL
  const averageR = metrics.averageR
  const winCount = trustedTrades.filter((trade) => (trade.netPnL ?? 0) > 0).length
  const lossCount = trustedTrades.filter((trade) => (trade.netPnL ?? 0) < 0).length
  const completeTrades = dayTrades.filter((trade) => trade.captureStatus === 'complete').length
  const incompleteTrades = dayTrades.length - completeTrades
  const dominantSetup = getDominantValue(dayTrades.map((trade) => trade.setup))
  const strongestEmotion = getDominantValue(dayTrades.map((trade) => trade.emotion))
  const trustedCoverage = dayTrades.length ? Math.round((trustedTrades.length / dayTrades.length) * 100) : 0
  const tone: DailyNoteFlowSummary['tone'] = metrics.monetaryScope.isComparable && trustedPnL > 0 ? 'emerald' : metrics.monetaryScope.isComparable && trustedPnL < 0 ? 'red' : 'orange'

  const prompts = [
    totalTradesLabel(dayTrades.length, locale),
    dominantSetup ? text(`Was hat bei ${dominantSetup} heute funktioniert oder gefehlt?`, `What worked with ${dominantSetup} today? What was missing?`) : text('Welcher Markt oder welches Setup hat heute den Ton gesetzt?', 'Which market or setup stood out today?'),
    incompleteTrades > 0 ? text('Welche Schnellerfassungen musst du noch vervollständigen?', 'Which quick entries still need details?') : text('Welche Entscheidung war heute am saubersten?', 'Which decision worked best today?'),
    trustedPnL < 0 ? text('Was war der konkrete Fehlerkern hinter den Verlusten?', 'What decision or mistake contributed to the losses?') : text('Was willst du morgen bewusst wiederholen?', 'What do you want to repeat tomorrow?'),
  ]

  const focusSuggestions = Array.from(new Set([
    incompleteTrades > 0 ? text('Schnellerfassungen vervollständigen', 'Complete quick entries') : null,
    dominantSetup ? text(`${dominantSetup} priorisieren`, `Prioritise ${dominantSetup}`) : null,
    trustedPnL < 0 ? text('Fehler vor Frequenz', 'Review mistakes before taking more trades') : null,
    strongestEmotion ? text(`Emotion ${strongestEmotion} einordnen`, `Reflect on ${getDailyMoodLabel(strongestEmotion, locale)}`) : null,
    ...DAILY_NOTE_FOCUS_PRESETS.map((preset) => text(preset, englishDailyFocus[preset])),
  ].filter(Boolean) as string[])).slice(0, 6)

  return {
    dateKey,
    existingNote,
    dayTrades,
    trustedTrades,
    completeTrades,
    incompleteTrades,
    totalTrades: dayTrades.length,
    trustedPnL,
    monetaryScope: metrics.monetaryScope,
    averageR,
    winCount,
    lossCount,
    trustedCoverage,
    dominantSetup,
    strongestEmotion,
    tone,
    headline: buildHeadline(dayTrades.length, trustedPnL, trustedCoverage, metrics.monetaryScope, locale),
    copy: buildCopy(dayTrades.length, incompleteTrades, dominantSetup, strongestEmotion, locale),
    titleSuggestion: existingNote?.title?.trim() || buildTitleSuggestion(dateKey, trustedPnL, dominantSetup, locale),
    noteStarter: parsedExistingNote.visibleNote || buildNoteStarter({ totalTrades: dayTrades.length, trustedPnL, averageR, dominantSetup, strongestEmotion, incompleteTrades, monetaryScope: metrics.monetaryScope }, locale),
    reviewHint:
      dayTrades.length === 0
        ? text('Auch ohne Trades lohnt sich eine Notiz, damit Kalender und Review echte Tageskontexte sehen.', 'You can record observations on days without trades.')
        : incompleteTrades > 0
          ? text('Ergänze die unvollständigen Schnellerfassungen oder notiere, welche Angaben noch fehlen.', 'Complete your quick entries or note which details are missing.')
          : trustedTrades.length === 0
            ? text('Für diesen Tag fehlen noch auswertbare Abschlüsse. Prüfe die Angaben an den Trades und halte deine Beobachtungen hier fest.', 'No usable results yet. Check your trade details and record your observations.')
            : text('Deine Notiz ergänzt die Zahlen im Review um deine Beobachtungen und Entscheidungen.', 'Record the decisions behind the results.'),
    prompts,
    focusSuggestions,
  }
}

function totalTradesLabel(totalTrades: number, locale: JournalLocale) {
  const text = journalText(locale)
  if (totalTrades === 0) return text('Kein Handelstag: Was war trotzdem dein Markt-Fokus?', 'No trades today. Which market were you watching?')
  if (totalTrades === 1) return text('1 Trade heute: Was war die Kernentscheidung des Tages?', 'One trade today. What was your key decision?')
  return text(`${totalTrades} Trades heute: Was war der rote Faden?`, `${totalTrades} trades today. What did they have in common?`)
}

function encodeMarkerValue(value: string) {
  return encodeURIComponent(value)
}

function decodeMarkerValue(value?: string) {
  if (!value?.trim()) return null
  try {
    return decodeURIComponent(value.trim())
  } catch {
    return null
  }
}
