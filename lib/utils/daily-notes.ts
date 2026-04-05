import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { formatCurrency, formatPlainNumber } from '@/lib/utils/calculations'
import { getDateKeyFromDate, normalizeTradeDate } from '@/lib/utils/calendar'
import { getTrustedTrades } from '@/lib/utils/trade-trust'

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
  averageR: number
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

function getTradesForDate(trades: Trade[], dateKey: string) {
  return trades.filter((trade) => getDateKeyFromDate(normalizeTradeDate(trade.createdAt ?? trade.date)) === dateKey)
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

function buildHeadline(totalTrades: number, trustedPnL: number, trustedCoverage: number) {
  if (totalTrades === 0) return 'Kein Handelstag, aber trotzdem ein wertvoller Tagesabschluss.'
  if (trustedPnL > 0) return `${totalTrades} Trade${totalTrades === 1 ? '' : 's'} im Journal, grüner trusted Tag.`
  if (trustedPnL < 0) return `${totalTrades} Trade${totalTrades === 1 ? '' : 's'} im Journal, roter Tag mit Review-Material.`
  if (trustedCoverage < 100) return `${totalTrades} Capture${totalTrades === 1 ? '' : 's'} sind da, aber der Tag ist noch nicht komplett belastbar.`
  return `${totalTrades} Trade${totalTrades === 1 ? '' : 's'} im Journal, neutraler Tag mit sauberem Datensatz.`
}

function buildCopy(totalTrades: number, incompleteTrades: number, dominantSetup: string | null, strongestEmotion: string | null) {
  if (totalTrades === 0) {
    return 'Auch an Non-Trade-Tagen lohnt sich ein kurzer Eintrag: Marktgefühl, Disziplin, was bewusst nicht gehandelt wurde.'
  }

  const fragments = [
    dominantSetup ? `Setup-Fokus heute: ${dominantSetup}.` : null,
    strongestEmotion ? `Emotion im Vordergrund: ${strongestEmotion}.` : null,
    incompleteTrades > 0 ? `${incompleteTrades} Quick Capture${incompleteTrades === 1 ? '' : 's'} warten noch auf Vollständigung.` : null,
  ].filter(Boolean)

  return fragments.join(' ') || 'Ein Tagesabschluss konserviert heute nicht nur P&L, sondern vor allem Kontext und Prozessqualität.'
}

function buildTitleSuggestion(dateKey: string, trustedPnL: number, dominantSetup: string | null) {
  if (dominantSetup && trustedPnL > 0) return `${dominantSetup} sauber gespielt`
  if (dominantSetup && trustedPnL < 0) return `${dominantSetup} mit Lernmoment`
  if (trustedPnL > 0) return `Solider Handelstag ${dateKey}`
  if (trustedPnL < 0) return `Review-Tag ${dateKey}`
  return `Tagesabschluss ${dateKey}`
}

function buildNoteStarter(input: {
  totalTrades: number
  trustedPnL: number
  averageR: number
  dominantSetup: string | null
  strongestEmotion: string | null
  incompleteTrades: number
}) {
  const { totalTrades, trustedPnL, averageR, dominantSetup, strongestEmotion, incompleteTrades } = input

  if (totalTrades === 0) {
    return 'Heute kein Trade. Marktbeobachtung, Fokus und Disziplin trotzdem kurz festhalten.'
  }

  const lines = [
    `Heute standen ${totalTrades} Trade${totalTrades === 1 ? '' : 's'} im Journal.${dominantSetup ? ` Das prägende Setup war ${dominantSetup}.` : ''}`,
    `Belastbare P&L: ${formatCurrency(trustedPnL)}${Number.isFinite(averageR) ? ` bei Ø ${formatPlainNumber(averageR, 2)}R.` : '.'}`,
    strongestEmotion ? `Emotional war der Tag vor allem ${strongestEmotion.toLowerCase()}.` : null,
    incompleteTrades > 0 ? `${incompleteTrades} Quick Capture${incompleteTrades === 1 ? '' : 's'} sollte${incompleteTrades === 1 ? '' : 'n'} noch vervollständigt werden.` : null,
    'Mein wichtigstes Learning:'
  ].filter(Boolean)

  return lines.join(' ')
}

export function buildDailyNoteFlowSummary(trades: Trade[], dailyNotes: DailyNoteRow[], dateKey = getBerlinTodayDateKey()): DailyNoteFlowSummary {
  const dayTrades = getTradesForDate(trades, dateKey)
  const trustedTrades = getTrustedTrades(dayTrades)
  const existingNote = getDailyNoteByDate(dailyNotes, dateKey)
  const parsedExistingNote = parseDailyNoteStorage(existingNote?.note)
  const trustedPnL = trustedTrades.reduce((sum, trade) => sum + (trade.netPnL ?? 0), 0)
  const averageR = trustedTrades.length
    ? trustedTrades.reduce((sum, trade) => sum + (trade.rValue ?? 0), 0) / trustedTrades.length
    : 0
  const winCount = trustedTrades.filter((trade) => (trade.netPnL ?? 0) > 0).length
  const lossCount = trustedTrades.filter((trade) => (trade.netPnL ?? 0) < 0).length
  const completeTrades = dayTrades.filter((trade) => trade.captureStatus === 'complete').length
  const incompleteTrades = dayTrades.length - completeTrades
  const dominantSetup = getDominantValue(dayTrades.map((trade) => trade.setup))
  const strongestEmotion = getDominantValue(dayTrades.map((trade) => trade.emotion))
  const trustedCoverage = dayTrades.length ? Math.round((trustedTrades.length / dayTrades.length) * 100) : 0
  const tone: DailyNoteFlowSummary['tone'] = trustedPnL > 0 ? 'emerald' : trustedPnL < 0 ? 'red' : 'orange'

  const prompts = [
    totalTradesLabel(dayTrades.length),
    dominantSetup ? `Was hat bei ${dominantSetup} heute funktioniert oder gefehlt?` : 'Welcher Markt oder welches Setup hat heute den Ton gesetzt?',
    incompleteTrades > 0 ? 'Welche Quick Captures müssen morgen noch vervollständigt werden?' : 'Welche Entscheidung war heute am saubersten?',
    trustedPnL < 0 ? 'Was war der konkrete Fehlerkern hinter den Verlusten?' : 'Was willst du morgen bewusst wiederholen?',
  ]

  const focusSuggestions = Array.from(new Set([
    incompleteTrades > 0 ? 'Quick Captures vervollständigen' : null,
    dominantSetup ? `${dominantSetup} priorisieren` : null,
    trustedPnL < 0 ? 'Fehler vor Frequenz' : null,
    strongestEmotion ? `Emotion ${strongestEmotion} einordnen` : null,
    ...DAILY_NOTE_FOCUS_PRESETS,
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
    averageR,
    winCount,
    lossCount,
    trustedCoverage,
    dominantSetup,
    strongestEmotion,
    tone,
    headline: buildHeadline(dayTrades.length, trustedPnL, trustedCoverage),
    copy: buildCopy(dayTrades.length, incompleteTrades, dominantSetup, strongestEmotion),
    titleSuggestion: existingNote?.title?.trim() || buildTitleSuggestion(dateKey, trustedPnL, dominantSetup),
    noteStarter: parsedExistingNote.visibleNote || buildNoteStarter({ totalTrades: dayTrades.length, trustedPnL, averageR, dominantSetup, strongestEmotion, incompleteTrades }),
    reviewHint:
      dayTrades.length === 0
        ? 'Auch ohne Trades lohnt sich eine Notiz, damit Kalender und Review echte Tageskontexte sehen.'
        : incompleteTrades > 0
          ? 'Schließe zuerst die offenen Quick Captures oder markiere in der Note, was morgen noch ergänzt werden muss.'
          : trustedTrades.length === 0
            ? 'Der Tag hat Trades, aber noch keinen trusted Untergrund. Eine Note hilft, bis P&L sauber ergänzt ist.'
            : 'Mit dieser Note bekommt Review morgen nicht nur Zahlen, sondern auch Kontext und Prozesssignal.',
    prompts,
    focusSuggestions,
  }
}

function totalTradesLabel(totalTrades: number) {
  if (totalTrades === 0) return 'Kein Handelstag: Was war trotzdem dein Markt-Fokus?'
  if (totalTrades === 1) return '1 Trade heute: Was war die Kernentscheidung des Tages?'
  return `${totalTrades} Trades heute: Was war der rote Faden?`
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
