'use client'

import Image from 'next/image'
import { type ReactNode, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createTradeShareSubmission,
  revokeTradeShareSubmission,
  updateSharedTradeSubmissionByAdmin,
} from '@/app/actions/shared-trades'
import { SectionHeader } from '@/components/layout/section-header'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { SharedTradeSubmissionRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import {
  coachLearningCategories,
  type SharedTradeShareMode,
  type SharedTradeStatus,
  type SharedTradeVisibility,
  getTradeShareCategoryLabel,
  getTradeShareModeLabel,
  getTradeShareStatusLabel,
  getTradeShareVisibilityLabel,
  joinDraftItems,
} from '@/lib/utils/trade-share'

const shareModeOptions: Array<{ value: SharedTradeShareMode; label: string; description: string }> = [
  { value: 'review', label: 'Feedback', description: 'Der Trade landet in einer privaten Feedback-Warteschlange für Equora.' },
  { value: 'vault', label: 'Sammlung', description: 'Der Trade darf als kuratiertes Lernbeispiel für die Equora Sammlung berücksichtigt werden.' },
  { value: 'both', label: 'Beides', description: 'Feedback + mögliche Aufnahme in die Sammlung für starke Lernbeispiele.' },
]

const visibilityOptions: Array<{ value: SharedTradeVisibility; label: string; description: string }> = [
  { value: 'anonymous', label: 'Anonym', description: 'In der Freigabe werden keine personenbezogenen Felder gespeichert. Sichtbar bleibt nur der Trade-Inhalt.' },
  { value: 'named', label: 'Mit Namen', description: 'Optionaler Name oder Nutzername für Feedback, Sammlung oder spätere Showcase-Nutzung.' },
]

const adminStatusOptions: SharedTradeStatus[] = ['pending', 'reviewed', 'featured', 'rejected', 'revoked']

type AdminDraft = {
  status: SharedTradeStatus
  adminNote: string
  coachFeedback: string
  learningCategory: string
  reviewLabels: string
  coachStrengths: string
  coachMistakes: string
  coachAction: string
  vaultBlurb: string
}

function buildTradeLabel(trade: Trade) {
  const pnlPart = trade.netPnL === null || trade.netPnL === undefined ? 'ohne P&L' : formatCurrency(trade.netPnL)
  return `${trade.date} · ${trade.market} · ${trade.setup} · ${pnlPart}`
}

function toneForStatus(status: SharedTradeStatus | string | null | undefined) {
  switch (status) {
    case 'featured':
      return 'border-[#c8823a]/25 bg-[#c8823a]/10 text-[#f0a855]/90'
    case 'reviewed':
      return 'border-[#f0a855]/22 bg-[#f0a855]/12 text-[#fff2df]/90'
    case 'rejected':
      return 'border-red-400/25 bg-red-400/10 text-red-100/85'
    case 'revoked':
      return 'border-white/15 bg-white/5 text-white/65'
    default:
      return 'border-white/10 bg-white/5 text-white/75'
  }
}

function renderSubmissionIdentity(submission: SharedTradeSubmissionRow) {
  if (submission.visibility === 'named' && submission.submitted_by_name?.trim()) {
    return submission.submitted_by_name.trim()
  }

  return 'Anonym eingereicht'
}

function formatTimestamp(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('de-DE')
}

function buildAdminDraft(submission: SharedTradeSubmissionRow): AdminDraft {
  return {
    status: (submission.status as SharedTradeStatus | null) ?? 'pending',
    adminNote: submission.admin_note ?? '',
    coachFeedback: submission.coach_feedback ?? '',
    learningCategory: submission.learning_category ?? '',
    reviewLabels: joinDraftItems(submission.review_labels),
    coachStrengths: joinDraftItems(submission.coach_strengths),
    coachMistakes: joinDraftItems(submission.coach_mistakes),
    coachAction: submission.coach_action ?? '',
    vaultBlurb: submission.vault_blurb ?? '',
  }
}

type EquoraShareHubProps = {
  trades: Trade[]
  ownSubmissions: SharedTradeSubmissionRow[]
  featuredSubmissions?: SharedTradeSubmissionRow[]
  adminSubmissions?: SharedTradeSubmissionRow[]
  selectedTradeId?: string
  isAdmin?: boolean
  source: 'supabase' | 'mock'
}

export function EquoraShareHub({
  trades,
  ownSubmissions,
  featuredSubmissions = [],
  adminSubmissions = [],
  selectedTradeId,
  isAdmin = false,
  source,
}: EquoraShareHubProps) {
  const router = useRouter()
  const [activeView, setActiveView] = useState<'share' | 'mine' | 'admin'>(selectedTradeId ? 'share' : ownSubmissions.length ? 'mine' : 'share')
  const [tradeId, setTradeId] = useState(selectedTradeId ?? ownSubmissions[0]?.trade_id ?? trades[0]?.id ?? '')
  const [shareMode, setShareMode] = useState<SharedTradeShareMode>('review')
  const [visibility, setVisibility] = useState<SharedTradeVisibility>('anonymous')
  const [vaultOptIn, setVaultOptIn] = useState(false)
  const [submittedByName, setSubmittedByName] = useState('')
  const [userNote, setUserNote] = useState('')
  const [statusText, setStatusText] = useState('')
  const [isPending, startTransition] = useTransition()

  const selectedTrade = useMemo(() => trades.find((trade) => trade.id === tradeId), [tradeId, trades])
  const existingSubmission = useMemo(
    () => ownSubmissions.find((submission) => submission.trade_id === tradeId),
    [ownSubmissions, tradeId],
  )

  useEffect(() => {
    if (!existingSubmission) {
      setShareMode('review')
      setVisibility('anonymous')
      setVaultOptIn(false)
      setSubmittedByName('')
      setUserNote('')
      return
    }

    setShareMode((existingSubmission.share_mode as SharedTradeShareMode | null) ?? 'review')
    setVisibility((existingSubmission.visibility as SharedTradeVisibility | null) ?? 'anonymous')
    setVaultOptIn(Boolean(existingSubmission.vault_opt_in))
    setSubmittedByName(existingSubmission.submitted_by_name ?? '')
    setUserNote(existingSubmission.user_note ?? '')
  }, [existingSubmission])

  function handleSubmit() {
    setStatusText('')
    startTransition(async () => {
      const result = await createTradeShareSubmission({
        tradeId,
        shareMode,
        visibility,
        userNote,
        vaultOptIn,
        submittedByName,
      })

      setStatusText(result.message)
      if (result.success) router.refresh()
    })
  }

  function handleRevoke(submissionId: string) {
    setStatusText('')
    startTransition(async () => {
      const result = await revokeTradeShareSubmission(submissionId)
      setStatusText(result.message)
      if (result.success) router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveView('share')}
          className={`rounded-full border px-4 py-2 text-sm transition ${activeView === 'share' ? 'border-orange-300/35 bg-orange-400/12 text-white' : 'border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:text-white'}`}
        >
          Teilen
        </button>
        <button
          type="button"
          onClick={() => setActiveView('mine')}
          className={`rounded-full border px-4 py-2 text-sm transition ${activeView === 'mine' ? 'border-orange-300/35 bg-orange-400/12 text-white' : 'border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:text-white'}`}
        >
          Meine
        </button>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setActiveView('admin')}
            className={`rounded-full border px-4 py-2 text-sm transition ${activeView === 'admin' ? 'border-orange-300/35 bg-orange-400/12 text-white' : 'border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:text-white'}`}
          >
            Admin
          </button>
        ) : null}
      </div>

      <details className="group rounded-3xl border border-orange-300/15 bg-black/25 p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="text-lg font-semibold text-white">Vault</span>
          <span className="rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1 text-xs text-orange-100/85">
            {featuredSubmissions.length}
            <span className="ml-2 group-open:hidden">Öffnen</span>
            <span className="ml-2 hidden group-open:inline">Schließen</span>
          </span>
        </summary>
        <div className="mt-4">
          <VaultCurationOverview featuredSubmissions={featuredSubmissions} />
        </div>
      </details>

      {activeView === 'share' ? (
        <FuturisticCard glow="orange" className="p-6">
          <SectionHeader
            eyebrow="Vault"
            title="Trade teilen"
            copy=""
            badge={source === 'supabase' ? 'Live' : 'Demo'}
          />

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5 rounded-3xl border border-[#c8823a]/16 bg-black/30 p-5">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Trade</span>
                <select
                  value={tradeId}
                  onChange={(event) => setTradeId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#f0a855]/15 bg-[#f0a855]/[0.05] px-4 py-3 text-sm text-white outline-none"
                >
                  {trades.length ? null : <option value="">Keine Trades</option>}
                  {trades.map((trade) => (
                    <option key={trade.id} value={trade.id} className="bg-black text-white">
                      {buildTradeLabel(trade)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 md:grid-cols-3">
                {shareModeOptions.map((option) => {
                  const isActive = shareMode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setShareMode(option.value)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        isActive
                          ? 'border-[#f0a855]/35 bg-[#f0a855]/12 text-white'
                          : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <p className="text-sm font-medium">{option.label}</p>
                    </button>
                  )
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {visibilityOptions.map((option) => {
                  const isActive = visibility === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setVisibility(option.value)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        isActive
                          ? 'border-[#c8823a]/35 bg-[#c8823a]/12 text-white'
                          : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <p className="text-sm font-medium">{option.label}</p>
                    </button>
                  )
                })}
              </div>

              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Name</span>
                <input
                  value={submittedByName}
                  onChange={(event) => setSubmittedByName(event.target.value)}
                  placeholder="Optional"
                  disabled={visibility !== 'named'}
                  className="mt-2 w-full rounded-2xl border border-[#c8823a]/15 bg-[#c8823a]/[0.05] px-4 py-3 text-sm text-white outline-none placeholder:text-white/28 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Notiz</span>
                <textarea
                  value={userNote}
                  onChange={(event) => setUserNote(event.target.value)}
                  rows={5}
                  placeholder="Kurztext"
                  className="mt-2 w-full rounded-3xl border border-white/10 bg-black/25 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/28"
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={vaultOptIn}
                  onChange={(event) => setVaultOptIn(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                />
                <span>Auch für Vault vormerken</span>
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending || !tradeId}
                  className="rounded-2xl border eq-button-primary px-5 py-3 text-sm font-medium transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? 'Sendet...' : 'Trade senden'}
                </button>
                {existingSubmission ? (
                  <button
                    type="button"
                    onClick={() => handleRevoke(existingSubmission.id)}
                    disabled={isPending}
                    className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/72 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Zurückziehen
                  </button>
                ) : null}
                <p className="text-sm text-white/55">{statusText || 'Nur freigegebene Trades.'}</p>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Vorschau</p>
                {selectedTrade ? (
                  <>
                    <h3 className="mt-3 text-xl font-semibold text-white">{selectedTrade.market} · {selectedTrade.setup}</h3>
                    <p className="mt-2 text-sm text-white/55">{selectedTrade.date}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MetricTile label="Resultat" value={selectedTrade.result} />
                      <MetricTile label="P&L" value={selectedTrade.netPnL === null || selectedTrade.netPnL === undefined ? '—' : formatCurrency(selectedTrade.netPnL)} />
                      <MetricTile label="R" value={selectedTrade.rMultiple === null || selectedTrade.rMultiple === undefined ? '—' : formatRMultiple(selectedTrade.rMultiple)} />
                      <MetricTile label="Status" value={selectedTrade.isComplete ? 'Komplett' : 'Kurz erfasst'} />
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-white/55">Wähle einen Trade.</p>
                )}
              </div>

              <details className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-white">Inhalt</summary>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                  <li>• Trade</li>
                  <li>• Notiz</li>
                  <li>• Sichtbarkeit</li>
                </ul>
              </details>
            </div>
          </div>
        </FuturisticCard>
      ) : null}

      {activeView === 'mine' ? (
        <FuturisticCard className="p-6">
          <SectionHeader
            eyebrow="Meine"
            title="Geteilte Trades"
            copy=""
            badge={`${ownSubmissions.length}`}
          />

          {ownSubmissions.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {ownSubmissions.map((submission) => (
                <SubmissionCard
                  key={submission.id}
                  submission={submission}
                  onRevoke={submission.status !== 'revoked' ? () => handleRevoke(submission.id) : undefined}
                  isPending={isPending}
                  showReviewDetails
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-sm leading-6 text-white/60">
              Noch nichts geteilt.
            </div>
          )}
        </FuturisticCard>
      ) : null}

      {isAdmin && activeView === 'admin' ? <AdminQueue submissions={adminSubmissions} /> : null}
    </div>
  )
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{label}</p>
      <p className="mt-3 text-sm font-medium text-white">{value}</p>
    </div>
  )
}

function InfoChip({ value, tone = 'neutral' }: { value: string; tone?: 'neutral' | 'gold' | 'highlight' | 'red' }) {
  const tones = {
    neutral: 'border-white/10 bg-white/5 text-white/72',
    gold: 'border-[#c8823a]/20 bg-[#c8823a]/10 text-[#f0a855]/90',
    highlight: 'border-[#f0a855]/20 bg-[#f0a855]/10 text-[#fff2df]/85',
    red: 'border-red-400/20 bg-red-400/10 text-red-100/82',
  }
  return <span className={`rounded-full border px-3 py-1 text-xs ${tones[tone]}`}>{value}</span>
}

function TextPanel({ eyebrow, children, tone = 'neutral' }: { eyebrow: string; children: ReactNode; tone?: 'neutral' | 'gold' | 'highlight' }) {
  const tones = {
    neutral: 'border-white/10 bg-white/[0.03]',
    gold: 'border-[#c8823a]/15 bg-[#c8823a]/[0.05]',
    highlight: 'border-[#f0a855]/15 bg-[#f0a855]/[0.05]',
  }
  return (
    <div className={`rounded-2xl p-4 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{eyebrow}</p>
      <div className="mt-3 text-sm leading-6 text-white/72">{children}</div>
    </div>
  )
}

function VaultCurationOverview({ featuredSubmissions }: { featuredSubmissions: SharedTradeSubmissionRow[] }) {
  const reviewReady = featuredSubmissions.length
  const uniqueCategories = new Set(featuredSubmissions.map((item) => item.learning_category).filter(Boolean)).size

  return (
    <FuturisticCard className="p-6">
      <SectionHeader
        eyebrow="Vault"
        title="Vault"
        copy=""
        badge={`${featuredSubmissions.length} Hervorgehoben`}
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <MetricTile label="Hervorgehoben" value={String(featuredSubmissions.length)} />
          <MetricTile label="Kategorien" value={String(uniqueCategories)} />
          <MetricTile label="Feedbacks" value={String(reviewReady)} />
        </div>

        {featuredSubmissions.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {featuredSubmissions.slice(0, 4).map((submission) => (
              <FeaturedVaultCard key={submission.id} submission={submission} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-sm leading-6 text-white/60">
            Keine Einträge.
          </div>
        )}
      </div>
    </FuturisticCard>
  )
}

function FeaturedVaultCard({ submission }: { submission: SharedTradeSubmissionRow }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
      {submission.shared_screenshot_url ? (
        <div className="aspect-[16/9] overflow-hidden border-b border-white/10 bg-black/35">
          <Image src={submission.shared_screenshot_url} alt={`${submission.shared_market} ${submission.shared_setup}`} width={960} height={540} sizes="(min-width: 1280px) 50vw, 100vw" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs ${toneForStatus(submission.status)}`}>
            {getTradeShareStatusLabel(submission.status)}
          </span>
          <InfoChip value={getTradeShareCategoryLabel(submission.learning_category)} tone="highlight" />
          <InfoChip value={renderSubmissionIdentity(submission)} />
        </div>

        <h3 className="mt-4 text-xl font-semibold text-white">{submission.shared_market} · {submission.shared_setup}</h3>
        <p className="mt-2 text-sm text-white/55">
          Resultat: {submission.shared_result ?? '—'} · P&amp;L {submission.shared_net_pnl === null || submission.shared_net_pnl === undefined ? '—' : formatCurrency(Number(submission.shared_net_pnl))} · R {submission.shared_r_multiple === null || submission.shared_r_multiple === undefined ? '—' : formatRMultiple(Number(submission.shared_r_multiple))}
        </p>

        {submission.vault_blurb ? <TextPanel eyebrow="Notiz" tone="highlight">{submission.vault_blurb}</TextPanel> : null}
        {submission.coach_feedback ? <TextPanel eyebrow="Feedback" tone="gold">{submission.coach_feedback}</TextPanel> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {(submission.review_labels ?? []).slice(0, 5).map((label) => (
            <InfoChip key={label} value={label} tone="gold" />
          ))}
        </div>
      </div>
    </div>
  )
}

function SubmissionCard({
  submission,
  onRevoke,
  isPending,
  showReviewDetails = false,
}: {
  submission: SharedTradeSubmissionRow
  onRevoke?: () => void
  isPending: boolean
  showReviewDetails?: boolean
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs ${toneForStatus(submission.status)}`}>
          {getTradeShareStatusLabel(submission.status)}
        </span>
        <InfoChip value={getTradeShareModeLabel(submission.share_mode)} tone="highlight" />
        <InfoChip value={getTradeShareVisibilityLabel(submission.visibility)} />
        {submission.submitted_by_name ? <InfoChip value={submission.submitted_by_name} tone="gold" /> : null}
      </div>
      <h3 className="mt-4 text-xl font-semibold text-white">{submission.shared_market} · {submission.shared_setup}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricTile label="Resultat" value={submission.shared_result ?? '—'} />
        <MetricTile label="P&L" value={submission.shared_net_pnl === null || submission.shared_net_pnl === undefined ? '—' : formatCurrency(Number(submission.shared_net_pnl))} />
        <MetricTile label="R" value={submission.shared_r_multiple === null || submission.shared_r_multiple === undefined ? '—' : formatRMultiple(Number(submission.shared_r_multiple))} />
        <MetricTile label="Tags" value={submission.shared_tags?.length ? submission.shared_tags.join(', ') : '—'} />
      </div>
      {submission.user_note ? <TextPanel eyebrow="Dein Kontext">{submission.user_note}</TextPanel> : null}
      {showReviewDetails && submission.learning_category ? <TextPanel eyebrow="Kategorie" tone="highlight">{submission.learning_category}</TextPanel> : null}
      {showReviewDetails && submission.admin_note ? <TextPanel eyebrow="Admin" tone="highlight">{submission.admin_note}</TextPanel> : null}
      {showReviewDetails && submission.coach_feedback ? <TextPanel eyebrow="Feedback" tone="gold">{submission.coach_feedback}</TextPanel> : null}
      {showReviewDetails && submission.coach_action ? <TextPanel eyebrow="Aktion" tone="gold">{submission.coach_action}</TextPanel> : null}

      {showReviewDetails && ((submission.review_labels?.length ?? 0) > 0 || (submission.coach_strengths?.length ?? 0) > 0 || (submission.coach_mistakes?.length ?? 0) > 0) ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <ChipPanel title="Labels" values={submission.review_labels} tone="gold" />
          <ChipPanel title="Stärken" values={submission.coach_strengths} tone="highlight" />
          <ChipPanel title="Fehler" values={submission.coach_mistakes} tone="red" />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-white/45">
        <span>{formatTimestamp(submission.created_at)}</span>
        {onRevoke ? (
          <button
            type="button"
            onClick={onRevoke}
            disabled={isPending}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/72 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Zurückziehen
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ChipPanel({ title, values, tone }: { title: string; values: string[] | null | undefined; tone: 'gold' | 'highlight' | 'red' }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(values ?? []).length ? (
          (values ?? []).map((value) => <InfoChip key={value} value={value} tone={tone} />)
        ) : (
          <span className="text-sm text-white/45">—</span>
        )}
      </div>
    </div>
  )
}

function AdminQueue({ submissions }: { submissions: SharedTradeSubmissionRow[] }) {
  const router = useRouter()
  const [statusMessage, setStatusMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [drafts, setDrafts] = useState<Record<string, AdminDraft>>({})

  useEffect(() => {
    const nextDrafts = submissions.reduce<Record<string, AdminDraft>>((acc, submission) => {
      acc[submission.id] = buildAdminDraft(submission)
      return acc
    }, {})

    setDrafts(nextDrafts)
  }, [submissions])

  function updateDraft(submissionId: string, patch: Partial<AdminDraft>) {
    setDrafts((current) => ({
      ...current,
      [submissionId]: {
        ...(current[submissionId] ?? buildAdminDraft(submissions.find((item) => item.id === submissionId) ?? submissions[0])),
        ...patch,
      },
    }))
  }

  function handleSave(submissionId: string) {
    const draft = drafts[submissionId]
    if (!draft) return

    setStatusMessage('')
    startTransition(async () => {
      const result = await updateSharedTradeSubmissionByAdmin({
        submissionId,
        status: draft.status,
        adminNote: draft.adminNote,
        coachFeedback: draft.coachFeedback,
        learningCategory: draft.learningCategory,
        reviewLabels: draft.reviewLabels,
        coachStrengths: draft.coachStrengths,
        coachMistakes: draft.coachMistakes,
        coachAction: draft.coachAction,
        vaultBlurb: draft.vaultBlurb,
      })
      setStatusMessage(result.message)
      if (result.success) router.refresh()
    })
  }

  return (
    <FuturisticCard className="p-6">
      <SectionHeader
        eyebrow="Coach-Warteschlange"
        title="Sammlung kuratieren und Feedback zurückspielen"
        copy="Freigegebene Trades, Status und Feedback."
        badge={`${submissions.length} Warteschlangen-Einträge`}
      />

      <p className="mb-4 text-sm text-white/55">{statusMessage || 'Adminbereich.'}</p>

      {submissions.length ? (
        <div className="space-y-4">
          {submissions.map((submission) => {
            const draft = drafts[submission.id] ?? buildAdminDraft(submission)

            return (
              <div key={submission.id} className="rounded-3xl border border-white/10 bg-black/25 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs ${toneForStatus(submission.status)}`}>
                        {getTradeShareStatusLabel(submission.status)}
                      </span>
                      <InfoChip value={getTradeShareModeLabel(submission.share_mode)} tone="highlight" />
                      <InfoChip value={renderSubmissionIdentity(submission)} />
                      {submission.learning_category ? <InfoChip value={submission.learning_category} tone="gold" /> : null}
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-white">{submission.shared_market} · {submission.shared_setup}</h3>
                    <p className="mt-2 text-sm text-white/55">
                      Resultat: {submission.shared_result ?? '—'} · P&amp;L {submission.shared_net_pnl === null || submission.shared_net_pnl === undefined ? '—' : formatCurrency(Number(submission.shared_net_pnl))} · R {submission.shared_r_multiple === null || submission.shared_r_multiple === undefined ? '—' : formatRMultiple(Number(submission.shared_r_multiple))}
                    </p>
                    <p className="mt-2 text-sm text-white/45">
                      Tags: {submission.shared_tags?.length ? submission.shared_tags.join(', ') : '—'} · Sichtbarkeit: {getTradeShareVisibilityLabel(submission.visibility)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/50">
                    {formatTimestamp(submission.created_at)}
                  </div>
                </div>

                {submission.user_note ? <TextPanel eyebrow="Kontext">{submission.user_note}</TextPanel> : null}

                <div className="mt-4 grid gap-4 xl:grid-cols-[220px_220px_1fr_1fr] xl:items-start">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Status</span>
                    <select
                      value={draft.status}
                      onChange={(event) => updateDraft(submission.id, { status: event.target.value as SharedTradeStatus })}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
                    >
                      {adminStatusOptions.map((option) => (
                        <option key={option} value={option} className="bg-black text-white">
                          {getTradeShareStatusLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Lern-Kategorie</span>
                    <select
                      value={draft.learningCategory}
                      onChange={(event) => updateDraft(submission.id, { learningCategory: event.target.value })}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
                    >
                      <option value="" className="bg-black text-white">Noch offen</option>
                      {coachLearningCategories.map((option) => (
                        <option key={option} value={option} className="bg-black text-white">
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Admin</span>
                    <textarea
                      value={draft.adminNote}
                      onChange={(event) => updateDraft(submission.id, { adminNote: event.target.value })}
                      rows={4}
                      className="mt-2 w-full rounded-3xl border border-white/10 bg-black/25 px-4 py-4 text-sm leading-6 text-white outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Feedback</span>
                    <textarea
                      value={draft.coachFeedback}
                      onChange={(event) => updateDraft(submission.id, { coachFeedback: event.target.value })}
                      rows={4}
                      className="mt-2 w-full rounded-3xl border border-[#c8823a]/15 bg-[#c8823a]/[0.05] px-4 py-4 text-sm leading-6 text-white outline-none"
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Labels</span>
                    <textarea
                      value={draft.reviewLabels}
                      onChange={(event) => updateDraft(submission.id, { reviewLabels: event.target.value })}
                      rows={4}
                      placeholder="z. B. FOMO\nzu früher Exit\nsaubere Struktur"
                      className="mt-2 w-full rounded-3xl border border-white/10 bg-black/25 px-4 py-4 text-sm leading-6 text-white outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Stärken</span>
                    <textarea
                      value={draft.coachStrengths}
                      onChange={(event) => updateDraft(submission.id, { coachStrengths: event.target.value })}
                      rows={4}
                      className="mt-2 w-full rounded-3xl border border-[#f0a855]/15 bg-[#f0a855]/[0.05] px-4 py-4 text-sm leading-6 text-white outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Fehler</span>
                    <textarea
                      value={draft.coachMistakes}
                      onChange={(event) => updateDraft(submission.id, { coachMistakes: event.target.value })}
                      rows={4}
                      className="mt-2 w-full rounded-3xl border border-red-400/15 bg-red-400/5 px-4 py-4 text-sm leading-6 text-white outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Aktion</span>
                    <textarea
                      value={draft.coachAction}
                      onChange={(event) => updateDraft(submission.id, { coachAction: event.target.value })}
                      rows={4}
                      className="mt-2 w-full rounded-3xl border border-[#c8823a]/15 bg-[#c8823a]/[0.05] px-4 py-4 text-sm leading-6 text-white outline-none"
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">Sammlungs-Text / Hervorhebungs-Text</span>
                    <textarea
                      value={draft.vaultBlurb}
                      onChange={(event) => updateDraft(submission.id, { vaultBlurb: event.target.value })}
                      rows={3}
                      placeholder="Kurztext für die kuratierte Sammlungskarte"
                      className="mt-2 w-full rounded-3xl border border-[#f0a855]/15 bg-[#f0a855]/[0.05] px-4 py-4 text-sm leading-6 text-white outline-none"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => handleSave(submission.id)}
                    disabled={isPending}
                    className="rounded-2xl border eq-button-primary px-5 py-3 text-sm font-medium transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? 'Speichert...' : 'Feedback speichern'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-sm text-white/55">
          Noch keine freigegebenen Trades in der Queue.
        </div>
      )}
    </FuturisticCard>
  )
}

function FlowCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-2 text-xs leading-5 text-white/55">{copy}</p>
    </div>
  )
}
