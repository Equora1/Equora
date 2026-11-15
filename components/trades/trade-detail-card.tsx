'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'
import { formatJournalTradeResult } from '@/lib/i18n/trade-display'
import Link from 'next/link'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import { TradeTagEditor } from '@/components/trades/trade-tag-editor'
import { TradeImageGallery } from '@/components/trades/trade-image-gallery'
import type { Trade, TradeDetail } from '@/lib/types/trade'
import { TradeActivityTimeline } from '@/components/trades/trade-activity-timeline'
import { getTradeTrustMeta } from '@/lib/utils/trade-trust'

type TradeDetailCardProps = {
  detail?: TradeDetail
  trade?: Trade
  tags?: Array<{ id: string; tag: string }>
  tradeId?: string
  detailHref?: string
  tagOptions?: string[]
  source?: 'supabase' | 'mock'
  onDelete?: () => void
  isDeleting?: boolean
}

type InfoItem = {
  label: string
  value?: string | null
}

function isMeaningful(value?: string | null) {
  return Boolean(value && value.trim() && value.trim() !== '—')
}

function DetailList({ items, compact = false }: { items: InfoItem[]; compact?: boolean }) {
  const text = journalText(useJournalLocale())
  const visible = items.filter((item) => isMeaningful(item.value))
  if (!visible.length) {
    return <p className="text-sm text-white/45">{text('Keine Angaben.', 'No details yet.')}</p>
  }

  return (
    <div className={`grid gap-3 ${compact ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2'}`}>
      {visible.map((item) => (
        <div key={item.label} className="rounded-3xl border border-white/10 bg-black/20 px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{item.label}</p>
          <p className="mt-2 text-sm leading-6 text-white/82">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

function Fold({
  title,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string
  badge?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const text = journalText(useJournalLocale())
  return (
    <details open={defaultOpen} className="group rounded-[28px] border border-white/10 bg-black/25 p-5 xl:p-6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
        <span className="text-sm font-semibold text-white">{title}</span>
        <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65">
          <span className="group-open:hidden">{badge ?? text('Öffnen', 'Open')}</span>
          <span className="hidden group-open:inline">{text('Schließen', 'Close')}</span>
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  )
}

function ImportSourceDetails({ detail }: { detail?: TradeDetail }) {
  const text = journalText(useJournalLocale())
  const importFacts = detail?.importFieldSourceFacts ?? []
  if (!detail?.importPresetLabel && !importFacts.length) return null

  return (
    <Fold title="Import" badge={detail?.importPresetLabel ?? 'Import'}>
      <DetailList
        compact
        items={[
          { label: 'Preset', value: detail?.importPresetLabel ?? text('Importiert', 'Imported') },
          ...importFacts,
        ]}
      />
    </Fold>
  )
}

function OpenTradeSection({ trade, detail, tradeId, detailHref }: { trade: Trade; detail?: TradeDetail; tradeId?: string; detailHref?: string }) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const hasPartialExits = Boolean(trade.partialExits?.length)
  const openFacts: InfoItem[] = [
    { label: text('Realisiert', 'Realised'), value: detail?.partialExitRealizedLabel },
    { label: text('Rest', 'Remaining position'), value: detail?.partialExitRemainingLabel },
    { label: text('Teilprofit', 'Partial exits'), value: detail?.partialExitStateLabel },
    { label: text('Risiko', 'Risk'), value: detail?.riskPlanLabel },
    { label: text('Stop-Risiko', 'Stop risk'), value: detail?.riskAmount },
    { label: text('Margin & Hebel', 'Margin & leverage'), value: detail?.marginLabel },
  ]


  return (
    <section className="rounded-[28px] border border-emerald-400/20 bg-emerald-400/[0.06] p-5 xl:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/70">{text('Offen', 'Open')}</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{text('Trade offen', 'Open trade')}</h3>
        </div>
        {tradeId ? (
          <div className="flex flex-wrap gap-2">
            {!hasPartialExits ? <Link
              href={`${detailHref ?? `/trades?tradeId=${encodeURIComponent(tradeId)}`}&editTradeId=${encodeURIComponent(tradeId)}#trade-editor`}
              className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/78 transition hover:border-white/20 hover:text-white"
            >
              {text('Vervollständigen', 'Complete trade')}
            </Link> : null}
            <Link
              href={`${detailHref ?? `/trades?tradeId=${encodeURIComponent(tradeId)}`}&${hasPartialExits ? 'editTradeId' : 'closeTradeId'}=${encodeURIComponent(tradeId)}#trade-editor`}
              className="rounded-full border border-emerald-300/30 bg-emerald-400/12 px-3 py-1.5 text-xs text-emerald-100 transition hover:border-emerald-200/45 hover:bg-emerald-400/18"
            >
              {hasPartialExits ? text('Restposition bearbeiten', 'Edit remaining position') : text('Schließen', 'Close trade')}
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-black/22 px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Stand', 'Current result')}</p>
          <p className="mt-2 text-sm font-medium text-emerald-100">{detail?.pnl ?? formatJournalTradeResult(trade, locale)}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/22 px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Rest', 'Remaining position')}</p>
          <p className="mt-2 text-sm font-medium text-white/85">{detail?.partialExitRemainingLabel ?? text('Noch offen', 'Still open')}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/22 px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Aktion', 'Next step')}</p>
          <p className="mt-2 text-sm font-medium text-white/85">{hasPartialExits ? text('Im vollständigen Formular schließen', 'Close in the full editor') : text('Trade schließen', 'Close trade')}</p>
        </div>
      </div>

      <div className="mt-4">
        <DetailList compact items={openFacts} />
      </div>
    </section>
  )
}

export function TradeDetailCard({
  detail,
  trade,
  tags = [],
  tradeId,
  detailHref,
  tagOptions,
  source = 'mock',
  onDelete,
  isDeleting = false,
}: TradeDetailCardProps) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const initialTagStrings = tags.map((t) => t.tag)
  const trust = trade ? getTradeTrustMeta(trade, locale) : null
  const hasOpenPosition = trade?.captureResult === 'open' || trade?.partialExitHasOpenRemainder === true
  const canQuickClose = hasOpenPosition && !trade?.partialExits?.length

  const primaryFacts: InfoItem[] = [
    { label: text('Konto', 'Account'), value: detail?.accountLabel ?? detail?.accountTemplateLabel },
    { label: text('Markt', 'Market'), value: detail?.title },
    { label: 'Setup', value: detail?.setup },
    { label: text('Richtung', 'Direction'), value: detail?.direction },
    { label: text('Vollständigkeit', 'Completeness'), value: detail?.captureStatusLabel },
    { label: 'Session', value: detail?.sessionLabel },
    { label: 'Kill Zone', value: detail?.killZoneLabel },
    { label: text('Zeit', 'Time (Berlin)'), value: detail?.tradeTimeLabel },
    { label: text('Ergebnis', 'Outcome'), value: hasOpenPosition ? text('Offen', 'Open') : detail?.captureResultLabel ?? detail?.result },
    { label: 'P&L', value: detail?.pnl },
  ]

  const executionFacts: InfoItem[] = [
    { label: text('P&L-Berechnung', 'P&L calculation'), value: detail?.pnlModeLabel },
    { label: text('Ergebnisgrundlage', 'How P&L was determined'), value: detail?.pnlSourceLabel },
    { label: 'Instrument', value: detail?.instrumentLabel },
    { label: text('Margin & Hebel', 'Margin & leverage'), value: detail?.marginLabel },
    { label: text('Teilprofit-Plan', 'Partial exit plan'), value: detail?.partialExitsLabel },
    { label: text('Teilprofit-Abdeckung', 'Position closed in partial exits'), value: detail?.partialExitCoverageLabel },
    { label: text('Realisiert', 'Realised'), value: detail?.partialExitRealizedLabel },
    { label: text('Rest', 'Remaining position'), value: detail?.partialExitRemainingLabel },
    { label: text('Ausstiegspreis', 'Exit price'), value: detail?.effectiveExitLabel },
    { label: text('Größe', 'Size'), value: detail?.sizeLabel },
    { label: text('Risiko', 'Risk'), value: detail?.riskPlanLabel },
    { label: text('Kontorisiko', 'Account risk'), value: detail?.accountRiskLabel },
    { label: text('Stop-Risiko', 'Stop risk'), value: detail?.riskAmount },
    { label: text('Preisrisiko', 'Price risk'), value: detail?.priceRisk },
    { label: text('CRV', 'Risk/reward'), value: detail?.riskReward },
    { label: text('Ausführung', 'Execution'), value: detail?.executionLabel },
    { label: text('Kosten', 'Costs'), value: detail?.costLabel },
  ]

  const reviewFacts: InfoItem[] = [
    { label: text('Regelcheck', 'Rule check'), value: detail?.ruleCheck },
    { label: text('Replizierbar', 'Repeatable'), value: detail?.reviewRepeatability },
    { label: 'Review', value: detail?.reviewState },
    { label: 'Emotion', value: detail?.emotion },
    { label: text('Qualität', 'Quality'), value: detail?.quality },
    { label: text('Learnings', 'Takeaways'), value: detail?.reviewLesson ?? detail?.lesson },
  ]

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d0d0d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">{trade?.market || detail?.title || 'Trade'}</h2>

        </div>
        <div className="flex flex-wrap gap-2">
          {tradeId ? (
            <>
              <Link
                href={`${detailHref ?? `/trades?tradeId=${encodeURIComponent(tradeId)}`}&${canQuickClose ? 'closeTradeId' : 'editTradeId'}=${encodeURIComponent(tradeId)}#trade-editor`}
                className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/20 hover:text-white"
              >
                {canQuickClose ? text('Schließen', 'Close trade') : trade?.captureStatus === 'incomplete' ? text('Vervollständigen', 'Complete trade') : text('Bearbeiten', 'Edit trade')}
              </Link>
              <Link
                href={`/share?tradeId=${encodeURIComponent(tradeId)}`}
                className="rounded-full border border-[#c8823a]/20 bg-[#c8823a]/10 px-3 py-1.5 text-xs text-[#f0a855] transition hover:border-[#f0a855]/35 hover:bg-[#c8823a]/15"
              >
                {text('Teilen', 'Share')}
              </Link>
              {onDelete ? (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-xs text-red-100 transition hover:border-red-400/35 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? text('Löscht …', 'Deleting …') : text('Löschen', 'Delete')}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-[28px] border border-white/10 bg-black/25 p-5 xl:p-6">
        <div>
          <DetailList compact items={primaryFacts} />
        </div>
      </div>

      {trade && hasOpenPosition ? <div className="mt-4"><OpenTradeSection trade={trade} detail={detail} tradeId={tradeId} detailHref={detailHref} /></div> : null}

      <div className={`mt-4 rounded-[28px] border px-5 py-4 text-sm xl:px-6 ${trust?.tone === 'red' ? 'border-red-400/20 bg-red-400/10 text-red-100' : trust?.tone === 'orange' ? 'border-orange-400/20 bg-orange-400/10 text-orange-100/90' : trust?.tone === 'emerald' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-black/20 text-white/65'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-current/20 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]">{trust?.shortLabel ?? 'Status'}</span>
          {trade?.pnlSource ? <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/75">P&amp;L {trade.pnlSource === 'derived' ? 'Auto' : trade.pnlSource === 'override' ? 'Override' : text('Manuell', 'Manual')}</span> : null}
          {trade?.completedAt && !hasOpenPosition ? <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70">{text('Abgeschlossen', 'Closed')}</span> : null}
        </div>
      </div>

      {trade ? (
        <div className="mt-4">
          <TradeActivityTimeline trade={trade} detail={detail} tagCount={tags.length} />
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <Fold title={text('Management', 'Execution & risk')}>
          <DetailList compact items={executionFacts} />
        </Fold>

        <Fold title="Review">
          <DetailList compact items={reviewFacts} />
        </Fold>

        <Fold title={text('Bilder & Tags', 'Images & tags')}>
          <div className="space-y-4">
            {detail?.screenshotUrl ? (
              <div className="overflow-hidden rounded-[28px] border border-[#c8823a]/16 bg-black/30 p-4">
                <div className="mx-auto w-full max-w-5xl">
                  <SetupImageLightbox
                    src={detail.screenshotUrl}
                    alt={`${detail.title} Screenshot`}
                    badge={detail?.setup ?? 'Screenshot'}
                    caption={detail?.date}
                    hint={text('Großansicht', 'Enlarge')} locale={locale}
                    className="rounded-[24px] border border-white/10 bg-black/40"
                    imageClassName="aspect-[16/6] w-full rounded-[24px] bg-[#050505] p-4 object-contain sm:aspect-[16/6] lg:aspect-[16/5]"
                    dialogClassName="max-w-[min(99vw,2200px)]"
                    dialogImageClassName="max-h-[96vh] w-full rounded-[1.65rem] object-contain"
                  />
                </div>
              </div>
            ) : null}

            {detail?.screenshotUrls?.length ? (
              <div>
                <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Bilder', 'Images')} · {detail.screenshotCount ?? detail.screenshotUrls.length}</p>
                <TradeImageGallery
                  images={(detail.screenshotItems?.length
                    ? detail.screenshotItems.map((item) => ({ id: item.id, image_url: item.url }))
                    : detail.screenshotUrls.map((imageUrl, index) => ({ id: `${tradeId ?? detail.title}-image-${index}`, image_url: imageUrl })))}
                  tradeId={tradeId}
                  source={source}
                />
              </div>
            ) : (
              <p className="text-sm text-white/45">{text('Keine Bilder.', 'No images yet.')}</p>
            )}

            {tradeId && tagOptions?.length ? (
              <TradeTagEditor
                tradeId={tradeId}
                tagOptions={tagOptions}
                initialTags={initialTagStrings}
                source={source}
              />
            ) : null}
          </div>
        </Fold>

        <ImportSourceDetails detail={detail} />
      </div>
    </section>
  )
}
