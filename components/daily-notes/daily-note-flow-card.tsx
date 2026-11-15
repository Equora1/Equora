'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'
import { formatRMultiple } from '@/lib/utils/calculations'
import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteDailyNote, saveDailyNote } from '@/app/actions/daily-notes'
import { SectionHeader } from '@/components/layout/section-header'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import {
  buildDailyNoteFlowSummary,
  DAILY_NOTE_MOODS,
  getBerlinTodayDateKey,
  getDailyMoodLabel,
  getDailyNoteByDate,
  parseDailyNoteStorage,
} from '@/lib/utils/daily-notes'
import { formatCurrency, formatPlainNumber } from '@/lib/utils/calculations'

type DailyNoteFlowCardProps = {
  trades: Trade[]
  dailyNotes: DailyNoteRow[]
  source: 'supabase' | 'mock'
  initialDateKey?: string
  compact?: boolean
  initialFocusValue?: string
}

export function DailyNoteFlowCard({
  trades,
  dailyNotes,
  source,
  initialDateKey = getBerlinTodayDateKey(),
  compact = false,
  initialFocusValue,
}: DailyNoteFlowCardProps) {
  const router = useRouter()
  const locale = useJournalLocale()
  const text = journalText(locale)
  const [dateKey, setDateKey] = useState(initialDateKey)
  const initialNote = getDailyNoteByDate(dailyNotes, initialDateKey)
  const [title, setTitle] = useState(initialNote?.title ?? '')
  const [mood, setMood] = useState(initialNote?.mood ?? '')
  const [focus, setFocus] = useState(initialNote?.focus ?? initialFocusValue ?? '')
  const [note, setNote] = useState(() => parseDailyNoteStorage(initialNote?.note).visibleNote)
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  const summary = useMemo(
    () => buildDailyNoteFlowSummary(trades, dailyNotes, dateKey, undefined, locale),
    [dailyNotes, dateKey, trades, locale],
  )

  const existingNote = summary.existingNote
  useEffect(() => {
    setTitle(existingNote?.title ?? '')
    setMood(existingNote?.mood ?? '')
    setFocus(existingNote?.focus ?? initialFocusValue ?? '')
    setNote(parseDailyNoteStorage(existingNote?.note).visibleNote)
  }, [initialFocusValue, dateKey, existingNote?.id, existingNote?.title, existingNote?.mood, existingNote?.focus, existingNote?.note])

  const glow = summary.tone === 'emerald' ? 'emerald' : summary.tone === 'red' ? 'red' : 'orange'
  const dayBadge = summary.existingNote ? text('bestehend', 'saved') : text('neu', 'new')
  const isMock = source !== 'supabase'

  function handleSave() {
    startTransition(async () => {
      const result = await saveDailyNote({
        tradeDate: dateKey,
        title,
        mood,
        focus,
        note,
      }, locale)

      setStatus({ text: result.message, ok: result.success })
      if (result.success) router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDailyNote(dateKey, locale)
      setStatus({ text: result.message, ok: result.success })

      if (result.success) {
        setTitle('')
        setMood('')
        setFocus('')
        setNote('')
        router.refresh()
      }
    })
  }

  return (
    <FuturisticCard glow={glow} className={compact ? 'p-5' : 'p-6'}>
      <SectionHeader
        eyebrow={text('Tagesnotiz', 'Daily note')}
        title={summary.existingNote ? text('Tagesnotiz aktualisieren', 'Update daily note') : text('Tagesnotiz schreiben', 'Write a daily note')}
        copy={summary.copy}
        badge={`${summary.dateKey} · ${dayBadge}`}
      />

      <div className={`grid gap-6 ${compact ? 'xl:grid-cols-[1.1fr_0.9fr]' : 'xl:grid-cols-[1.12fr_0.88fr]'}`}>
        <div className="space-y-4 rounded-[30px] border border-orange-400/15 bg-black/35 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.24em] text-orange-200/75">{text('Heute', 'Selected day')}</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{summary.headline}</h3>
              <p className="mt-3 text-sm leading-6 text-white/60">{summary.reviewHint}</p>
            </div>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Datum', 'Date (Berlin)')}</span>
              <input
                type="date"
                value={dateKey}
                onChange={(event) => setDateKey(event.target.value)}
                className="mt-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
              />
            </label>
          </div>

          <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <summary className="cursor-pointer text-sm font-medium text-white">{text('Tagesüberblick und Kennzahlen · optional', 'Daily overview and metrics')}</summary>
            <div className="mt-4">
          <div className={`grid gap-4 ${compact ? 'lg:grid-cols-[1.15fr_0.85fr]' : 'lg:grid-cols-[1.1fr_0.9fr]'}`}>
            <div className="rounded-[26px] border border-orange-400/15 bg-orange-400/5 p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-100/70">{text('Kurzstand', 'Summary')}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetricTile label="Trades" value={String(summary.totalTrades)} tone="text-white" />
                <MetricTile label={text('mit P&L', 'With P&L')} value={`${summary.trustedTrades.length} / ${summary.totalTrades || 0}`} tone="text-emerald-300" />
                <MetricTile label="P&L" value={summary.monetaryScope.isComparable ? formatCurrency(summary.trustedPnL, 0, summary.monetaryScope.currency, locale) : text('Gesperrt', 'Unavailable')} tone={summary.monetaryScope.isComparable ? summary.trustedPnL >= 0 ? 'text-emerald-300' : 'text-red-300' : 'text-orange-100'} />
                <MetricTile label={text('Für Kennzahlen erfasst', 'Included in metrics')} value={`${summary.trustedCoverage}%`} tone="text-orange-100/85" />
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Auffällig', 'Highlights')}</p>
              <div className="mt-4 space-y-3 text-sm text-white/72">
                <div className="flex items-center justify-between gap-3"><span>Setup</span><span className="text-white">{summary.dominantSetup ?? '—'}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Emotion</span><span className="text-white">{summary.strongestEmotion ? getDailyMoodLabel(summary.strongestEmotion, locale) : '—'}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Wins / Losses</span><span className="text-white">{summary.winCount} / {summary.lossCount}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Ø R</span><span className="text-white">{formatRMultiple(summary.averageR, 2, locale)}</span></div>
              </div>
            </div>
          </div>

            </div>
          </details>

          <div className={`grid gap-4 ${compact ? 'lg:grid-cols-[0.95fr_1.05fr]' : 'lg:grid-cols-2'}`}>
            <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Drei Fragen', 'Reflection questions')}</p>
              <div className="mt-4 space-y-3">
                {summary.prompts.slice(0, compact ? 3 : 4).map((prompt) => (
                  <div key={prompt} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/70">
                    {prompt}
                  </div>
                ))}
              </div>
            </div>

            {summary.dayTrades.length ? (
              <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Trades</p>
                    <p className="mt-2 text-sm text-white/58">{text('Die wichtigsten Trades des Tages bleiben schnell erreichbar.', 'Open this day in the calendar to see individual trades.')}</p>
                  </div>
                  <Link href={`/kalender?month=${dateKey.slice(0, 7)}&day=${dateKey}`} className="text-xs text-orange-100/80 transition hover:text-orange-100">
                    {text('Im Kalender lesen', 'View in calendar')}
                  </Link>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {summary.dayTrades.slice(0, compact ? 4 : 6).map((trade) => (
                    <span key={trade.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72">
                      {trade.market} · {trade.setup}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-[26px] border border-white/10 bg-black/20 p-5 text-sm text-white/55">
                {text('Für dieses Datum liegen noch keine Trades vor.', 'No trades for this day.')}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-[30px] border border-white/10 bg-white/[0.03] p-5">
          <div className="rounded-[26px] border border-orange-400/15 bg-orange-400/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-orange-100/70">{text('Morgen', 'Tomorrow')}</p>
            <p className="mt-2 text-sm leading-6 text-white/68">
              {text('Ein Satz reicht: Was soll morgen sauberer werden?', 'What would you change tomorrow?')}
            </p>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Fokus für morgen', 'Focus for tomorrow')}</p>
            <p className="mt-2 text-sm leading-6 text-white/68">{text('Ein klarer Fokus reicht.', 'Choose one thing to work on.')}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/70">{text('Heute notiert:', 'Saved focus:')} {summary.existingNote?.focus ?? text('noch offen', 'None yet')}</span>
              <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-orange-100/85">{text('Morgen:', 'Tomorrow:')} {focus || text('noch kein Fokus gesetzt', 'No focus yet')}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Titel', 'Title')}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={summary.titleSuggestion}
                className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
              />
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Stimmung', 'Mood')}</span>
              <select value={mood} onChange={(event) => setMood(event.target.value)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
                <option value="">{text('Stimmung wählen', 'Choose a mood')}</option>
                {mood && !DAILY_NOTE_MOODS.some((option) => option === mood) ? <option value={mood}>{mood}</option> : null}
                  {DAILY_NOTE_MOODS.map((option) => (
                  <option key={option} value={option}>{getDailyMoodLabel(option, locale)}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Fokus', 'Focus')}</span>
            <input
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              placeholder={summary.focusSuggestions[0]}
              className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {summary.focusSuggestions.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setFocus(preset)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
              >
                {preset}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Notiz', 'Note')}</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={compact ? 8 : 10}
              placeholder={existingNote ? text('Deine Beobachtungen', 'Your observations') : summary.noteStarter}
              className="mt-2 w-full rounded-[26px] border border-orange-400/15 bg-orange-400/5 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/30"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-sm ${status ? (status.ok ? 'text-emerald-300' : 'text-orange-200') : 'text-white/45'}`}>
              {status?.text ?? (isMock ? text('Im Demo-Modus ist die Tagesnotiz sichtbar, aber nicht schreibbar.', 'Daily notes are read-only in demo mode.') : text('Tagesnotizen werden in deinem Nutzerkonto gespeichert.', 'Daily notes are saved to your account.'))}
            </p>

            <div className="flex flex-wrap gap-3">
              {summary.existingNote ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending || isMock}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {text('Löschen', 'Delete')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || isMock}
                className="rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition hover:border-orange-400/40 hover:bg-orange-400/14 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? text('Speichert...', 'Saving…') : summary.existingNote ? text('Tagesnotiz aktualisieren', 'Update daily note') : text('Tagesnotiz speichern', 'Save daily note')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </FuturisticCard>
  )
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className={`mt-2 text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  )
}
