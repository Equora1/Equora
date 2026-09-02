'use client'

import Link from 'next/link'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import { TradeTagEditor } from '@/components/trades/trade-tag-editor'
import { TradeImageGallery } from '@/components/trades/trade-image-gallery'
import type { Trade, TradeDetail } from '@/lib/types/trade'
import { TradeActivityTimeline } from '@/components/trades/trade-activity-timeline'
import { getTradeTrustChecklist } from '@/lib/utils/trade-trust'

type TradeDetailCardProps = {
  detail?: TradeDetail
  trade?: Trade
  tags?: Array<{ id: string; tag: string }>
  tradeId?: string
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
  const visible = items.filter((item) => isMeaningful(item.value))
  if (!visible.length) {
    return <p className="text-sm text-white/45">Keine Angaben.</p>
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
  return (
    <details open={defaultOpen} className="group rounded-[28px] border border-white/10 bg-black/25 p-5 xl:p-6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
        <span className="text-sm font-semibold text-white">{title}</span>
        <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65">
          <span className="group-open:hidden">{badge ?? 'Öffnen'}</span>
          <span className="hidden group-open:inline">Schließen</span>
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  )
}

function ImportSourceDetails({ detail }: { detail?: TradeDetail }) {
  const importFacts = detail?.importFieldSourceFacts ?? []
  if (!detail?.importPresetLabel && !importFacts.length) return null

  return (
    <Fold title="Import" badge={detail?.importPresetLabel ?? 'Import'}>
      <DetailList
        compact
        items={[
          { label: 'Preset', value: detail?.importPresetLabel ?? 'Importiert' },
          ...importFacts,
        ]}
      />
    </Fold>
  )
}

function OpenTradeSection({ trade, detail, tradeId }: { trade: Trade; detail?: TradeDetail; tradeId?: string }) {
  const openFacts: InfoItem[] = [
    { label: 'Realisiert', value: detail?.partialExitRealizedLabel },
    { label: 'Rest', value: detail?.partialExitRemainingLabel },
    { label: 'Teilprofit', value: detail?.partialExitStateLabel },
    { label: 'Risiko', value: detail?.riskPlanLabel },
    { label: 'Stop-Risiko', value: detail?.riskAmount },
    { label: 'Margin & Hebel', value: detail?.marginLabel },
  ]


  return (
    <section className="rounded-[28px] border border-emerald-400/20 bg-emerald-400/[0.06] p-5 xl:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/70">Offen</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Trade offen</h3>
        </div>
        {tradeId ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/trades?tradeId=${encodeURIComponent(tradeId)}&editTradeId=${encodeURIComponent(tradeId)}#trade-editor`}
              className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-white/78 transition hover:border-white/20 hover:text-white"
            >
              Vervollständigen
            </Link>
            <Link
              href={`/trades?tradeId=${encodeURIComponent(tradeId)}&closeTradeId=${encodeURIComponent(tradeId)}#trade-editor`}
              className="rounded-full border border-emerald-300/30 bg-emerald-400/12 px-3 py-1.5 text-xs text-emerald-100 transition hover:border-emerald-200/45 hover:bg-emerald-400/18"
            >
              Schließen
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-black/22 px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Stand</p>
          <p className="mt-2 text-sm font-medium text-emerald-100">{trade.result}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/22 px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Rest</p>
          <p className="mt-2 text-sm font-medium text-white/85">{detail?.partialExitRemainingLabel ?? 'Noch offen'}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/22 px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Aktion</p>
          <p className="mt-2 text-sm font-medium text-white/85">Trade schließen</p>
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
  tagOptions,
  source = 'mock',
  onDelete,
  isDeleting = false,
}: TradeDetailCardProps) {
  const initialTagStrings = tags.map((t) => t.tag)
  const trust = trade ? getTradeTrustChecklist(trade) : null

  const primaryFacts: InfoItem[] = [
    { label: 'Konto', value: detail?.accountLabel ?? detail?.accountTemplateLabel },
    { label: 'Markt', value: detail?.title },
    { label: 'Setup', value: detail?.setup },
    { label: 'Richtung', value: detail?.direction },
    { label: 'Vollständigkeit', value: detail?.captureStatusLabel },
    { label: 'Session', value: detail?.sessionLabel },
    { label: 'Kill Zone', value: detail?.killZoneLabel },
    { label: 'Zeit', value: detail?.tradeTimeLabel },
    { label: 'Ergebnis', value: detail?.captureResultLabel ?? detail?.result },
    { label: 'P&L', value: detail?.pnl },
  ]

  const executionFacts: InfoItem[] = [
    { label: 'Entry / Exit', value: detail?.pnlModeLabel },
    { label: 'Instrument', value: detail?.instrumentLabel },
    { label: 'Margin & Hebel', value: detail?.marginLabel },
    { label: 'Teilprofit-Plan', value: detail?.partialExitsLabel },
    { label: 'Teilprofit-Abdeckung', value: detail?.partialExitCoverageLabel },
    { label: 'Realisiert', value: detail?.partialExitRealizedLabel },
    { label: 'Rest', value: detail?.partialExitRemainingLabel },
    { label: 'Ø Exit', value: detail?.effectiveExitLabel },
    { label: 'Größe', value: detail?.sizeLabel },
    { label: 'Risiko', value: detail?.riskPlanLabel },
    { label: 'Kontorisiko', value: detail?.accountRiskLabel },
    { label: 'Stop-Risiko', value: detail?.riskAmount },
    { label: 'Preisrisiko', value: detail?.priceRisk },
    { label: 'CRV', value: detail?.riskReward },
    { label: 'Ausführung', value: detail?.executionLabel },
    { label: 'Kosten', value: detail?.costLabel },
  ]

  const reviewFacts: InfoItem[] = [
    { label: 'Regelcheck', value: detail?.ruleCheck },
    { label: 'Replizierbar', value: detail?.reviewRepeatability },
    { label: 'Review', value: detail?.reviewState },
    { label: 'Emotion', value: detail?.emotion },
    { label: 'Qualität', value: detail?.quality },
    { label: 'Learnings', value: detail?.reviewLesson ?? detail?.lesson },
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
                href={detail?.captureResultLabel === 'Offen' ? `/trades?tradeId=${encodeURIComponent(tradeId)}&closeTradeId=${encodeURIComponent(tradeId)}#trade-editor` : `/trades?tradeId=${encodeURIComponent(tradeId)}&editTradeId=${encodeURIComponent(tradeId)}#trade-editor`}
                className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/20 hover:text-white"
              >
                {detail?.captureResultLabel === 'Offen' ? 'Schließen' : detail?.captureStatusLabel === 'Unvollständig' ? 'Vervollständigen' : 'Bearbeiten'}
              </Link>
              <Link
                href={`/share?tradeId=${encodeURIComponent(tradeId)}`}
                className="rounded-full border border-[#c8823a]/20 bg-[#c8823a]/10 px-3 py-1.5 text-xs text-[#f0a855] transition hover:border-[#f0a855]/35 hover:bg-[#c8823a]/15"
              >
                Teilen
              </Link>
              {onDelete ? (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isDeleting}
                  className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-xs text-red-100 transition hover:border-red-400/35 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? 'Löscht …' : 'Löschen'}
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

      {trade?.captureResult === 'open' ? <div className="mt-4"><OpenTradeSection trade={trade} detail={detail} tradeId={tradeId} /></div> : null}

      <div className={`mt-4 rounded-[28px] border px-5 py-4 text-sm xl:px-6 ${trust?.tone === 'red' ? 'border-red-400/20 bg-red-400/10 text-red-100' : trust?.tone === 'orange' ? 'border-orange-400/20 bg-orange-400/10 text-orange-100/90' : trust?.tone === 'emerald' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-black/20 text-white/65'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-current/20 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]">{trust?.shortLabel ?? 'Status'}</span>
          {trade?.pnlSource ? <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/75">P&amp;L {trade.pnlSource === 'derived' ? 'Auto' : trade.pnlSource === 'override' ? 'Override' : 'Manuell'}</span> : null}
          {trade?.completedAt ? <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70">Abgeschlossen</span> : null}
        </div>
      </div>

      {trade ? (
        <div className="mt-4">
          <TradeActivityTimeline trade={trade} detail={detail} tagCount={tags.length} />
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <Fold title="Management">
          <DetailList compact items={executionFacts} />
        </Fold>

        <Fold title="Review">
          <DetailList compact items={reviewFacts} />
        </Fold>

        <Fold title="Bilder & Tags">
          <div className="space-y-4">
            {detail?.screenshotUrl ? (
              <div className="overflow-hidden rounded-[28px] border border-[#c8823a]/16 bg-black/30 p-4">
                <div className="mx-auto w-full max-w-5xl">
                  <SetupImageLightbox
                    src={detail.screenshotUrl}
                    alt={`${detail.title} Screenshot`}
                    badge={detail?.setup ?? 'Screenshot'}
                    caption={detail?.date}
                    hint="Großansicht"
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
                <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-white/35">Bilder · {detail.screenshotCount ?? detail.screenshotUrls.length}</p>
                <TradeImageGallery
                  images={(detail.screenshotItems?.length
                    ? detail.screenshotItems.map((item) => ({ id: item.id, image_url: item.url }))
                    : detail.screenshotUrls.map((imageUrl, index) => ({ id: `${tradeId ?? detail.title}-image-${index}`, image_url: imageUrl })))}
                  tradeId={tradeId}
                  source={source}
                />
              </div>
            ) : (
              <p className="text-sm text-white/45">Keine Bilder.</p>
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
