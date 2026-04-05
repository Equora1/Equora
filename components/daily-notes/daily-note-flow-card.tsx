'use client'

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
  DAILY_NOTE_FOCUS_PRESETS,
  DAILY_NOTE_MOODS,
  getBerlinTodayDateKey,
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
  const [dateKey, setDateKey] = useState(initialDateKey)
  const [title, setTitle] = useState('')
  const [mood, setMood] = useState('')
  const [focus, setFocus] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  const summary = useMemo(
    () => buildDailyNoteFlowSummary(trades, dailyNotes, dateKey),
    [dailyNotes, dateKey, trades],
  )

  useEffect(() => {
    setTitle(summary.existingNote?.title ?? summary.titleSuggestion)
    setMood(summary.existingNote?.mood ?? '')
    setFocus(summary.existingNote?.focus ?? initialFocusValue ?? summary.focusSuggestions[0] ?? DAILY_NOTE_FOCUS_PRESETS[0])
    setNote(summary.noteStarter)
    setStatus(null)
  }, [initialFocusValue, summary.dateKey, summary.existingNote?.id, summary.titleSuggestion, summary.noteStarter, summary.focusSuggestions])

  const glow = summary.tone === 'emerald' ? 'emerald' : summary.tone === 'red' ? 'red' : 'orange'
  const dayBadge = summary.existingNote ? 'bestehend' : 'neu'
  const isMock = source !== 'supabase'

  function handleSave() {
    startTransition(async () => {
      const result = await saveDailyNote({
        tradeDate: dateKey,
        title,
        mood,
        focus,
        note,
      })

      setStatus({ text: result.message, ok: result.success })
      if (result.success) router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDailyNote(dateKey)
      setStatus({ text: result.message, ok: result.success })

      if (result.success) {
        setTitle(summary.titleSuggestion)
        setMood('')
        setFocus(summary.focusSuggestions[0] ?? DAILY_NOTE_FOCUS_PRESETS[0])
        setNote(summary.noteStarter)
        router.refresh()
      }
    })
  }

  return (
    <FuturisticCard glow={glow} className={compact ? 'p-5' : 'p-6'}>
      <SectionHeader
        eyebrow="Daily Note"
        title={summary.existingNote ? 'Tagesabschluss aktualisieren' : 'End-of-Day Flow schließen'}
        copy={summary.copy}
        badge={`${summary.dateKey} · ${dayBadge}`}
      />

      <div className={`grid gap-6 ${compact ? 'xl:grid-cols-[1.1fr_0.9fr]' : 'xl:grid-cols-[1.12fr_0.88fr]'}`}>
        <div className="space-y-4 rounded-[30px] border border-orange-400/15 bg-black/35 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.24em] text-orange-200/75">Tagesfenster</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{summary.headline}</h3>
              <p className="mt-3 text-sm leading-6 text-white/60">{summary.reviewHint}</p>
            </div>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Datum</span>
              <input
                type="date"
                value={dateKey}
                onChange={(event) => setDateKey(event.target.value)}
                className="mt-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
              />
            </label>
          </div>

          <div className={`grid gap-4 ${compact ? 'lg:grid-cols-[1.15fr_0.85fr]' : 'lg:grid-cols-[1.1fr_0.9fr]'}`}>
            <div className="rounded-[26px] border border-orange-400/15 bg-orange-400/5 p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-100/70">Tageskern</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetricTile label="Trades" value={String(summary.totalTrades)} tone="text-white" />
                <MetricTile label="Belastbar" value={`${summary.trustedTrades.length} / ${summary.totalTrades || 0}`} tone="text-emerald-300" />
                <MetricTile label="P&L" value={formatCurrency(summary.trustedPnL)} tone={summary.trustedPnL >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                <MetricTile label="Coverage" value={`${summary.trustedCoverage}%`} tone="text-orange-100/85" />
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Heute sichtbar</p>
              <div className="mt-4 space-y-3 text-sm text-white/72">
                <div className="flex items-center justify-between gap-3"><span>Setup</span><span className="text-white">{summary.dominantSetup ?? '—'}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Emotion</span><span className="text-white">{summary.strongestEmotion ?? '—'}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Wins / Losses</span><span className="text-white">{summary.winCount} / {summary.lossCount}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Ø R</span><span className="text-white">{formatPlainNumber(summary.averageR, 2)}R</span></div>
              </div>
            </div>
          </div>

          <div className={`grid gap-4 ${compact ? 'lg:grid-cols-[0.95fr_1.05fr]' : 'lg:grid-cols-2'}`}>
            <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Prompts für den Abschluss</p>
              <div className="mt-4 space-y-3">
                {summary.prompts.slice(0, compact ? 3 : 4).map((prompt, index) => (
                  <div key={prompt} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/70">
                    <span className="mr-2 text-white/35">0{index + 1}</span>
                    {prompt}
                  </div>
                ))}
              </div>
            </div>

            {summary.dayTrades.length ? (
              <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Tagesmaterial</p>
                    <p className="mt-2 text-sm text-white/58">Die wichtigsten Trades des Tages als schneller Rückweg in den Kalender.</p>
                  </div>
                  <Link href={`/kalender`} className="text-xs text-orange-100/80 transition hover:text-orange-100">
                    Im Kalender lesen
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
                Für dieses Datum liegt noch kein Tagesmaterial vor.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-[30px] border border-white/10 bg-white/[0.03] p-5">
          <div className="rounded-[26px] border border-orange-400/15 bg-orange-400/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-orange-100/70">Nächster Eintrag</p>
            <p className="mt-2 text-sm leading-6 text-white/68">
              Halte nur fest, was morgen die Richtung spürbar verbessert. Nicht protokollieren wie ein Buchhalter. Entscheiden wie ein Coach.
            </p>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Fokus-Brücke</p>
            <p className="mt-2 text-sm leading-6 text-white/68">Der Satz für morgen darf leicht sein. Ein Fokus reicht völlig.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/70">Heute notiert: {summary.existingNote?.focus ?? 'noch offen'}</span>
              <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-orange-100/85">Morgen: {focus || 'noch kein Fokus gesetzt'}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Titel</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={summary.titleSuggestion}
                className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
              />
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Stimmung</span>
              <select value={mood} onChange={(event) => setMood(event.target.value)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
                <option value="">Mood wählen</option>
                {DAILY_NOTE_MOODS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Fokus für morgen</span>
            <input
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              placeholder={summary.focusSuggestions[0] ?? DAILY_NOTE_FOCUS_PRESETS[0]}
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
            <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Notiz</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={compact ? 8 : 10}
              placeholder={summary.noteStarter}
              className="mt-2 w-full rounded-[26px] border border-orange-400/15 bg-orange-400/5 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/30"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-sm ${status ? (status.ok ? 'text-emerald-300' : 'text-orange-200') : 'text-white/45'}`}>
              {status?.text ?? (isMock ? 'Im Demo-Modus sind Daily Notes sichtbar, aber nicht schreibbar.' : 'Daily Notes landen direkt user-gebunden in Supabase.')}
            </p>

            <div className="flex flex-wrap gap-3">
              {summary.existingNote ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending || isMock}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Löschen
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || isMock}
                className="rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition hover:border-orange-400/40 hover:bg-orange-400/14 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? 'Speichert...' : summary.existingNote ? 'Daily Note aktualisieren' : 'Daily Note speichern'}
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
