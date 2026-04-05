import Link from 'next/link'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import { TradeTagEditor } from '@/components/trades/trade-tag-editor'
import { TradeImageGallery } from '@/components/trades/trade-image-gallery'
import type { Trade, TradeDetail } from '@/lib/types/trade'
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

function DetailList({ items }: { items: InfoItem[] }) {
  const visible = items.filter((item) => isMeaningful(item.value))
  if (!visible.length) {
    return <p className="text-sm text-white/45">Noch keine zusätzlichen Angaben vorhanden.</p>
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {visible.map((item) => (
        <div key={item.label} className="rounded-3xl border border-white/10 bg-black/20 px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{item.label}</p>
          <p className="mt-2 text-sm leading-6 text-white/80">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

function DetailSection({ title, subtitle, items }: { title: string; subtitle: string; items: InfoItem[] }) {
  const visible = items.filter((item) => isMeaningful(item.value))
  return (
    <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 xl:p-6">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.24em] text-white/35">{title}</p>
        <p className="mt-2 text-sm leading-6 text-white/55">{subtitle}</p>
      </div>
      <div className="mt-4">{visible.length ? <DetailList items={visible} /> : <p className="text-sm text-white/45">Noch keine zusätzlichen Angaben vorhanden.</p>}</div>
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
    { label: 'Asset', value: detail?.title },
    { label: 'Setup', value: detail?.setup },
    { label: 'Richtung', value: detail?.direction },
    { label: 'Status', value: detail?.captureStatusLabel },
    { label: 'Ergebnis', value: detail?.captureResultLabel ?? detail?.result },
    { label: 'P&L', value: detail?.pnl },
  ]

  const executionFacts: InfoItem[] = [
    { label: 'Entry / Exit', value: detail?.pnlModeLabel },
    { label: 'Instrument', value: detail?.instrumentLabel },
    { label: 'Margin & Hebel', value: detail?.marginLabel },
    { label: 'Teilprofit-Plan', value: detail?.partialExitsLabel },
    { label: 'Teilprofit-Abdeckung', value: detail?.partialExitCoverageLabel },
    { label: 'Bereits realisiert', value: detail?.partialExitRealizedLabel },
    { label: 'Restposition', value: detail?.partialExitRemainingLabel },
    { label: 'Teilprofit-Status', value: detail?.partialExitStateLabel },
    { label: 'Ø Exit aus Staffelung', value: detail?.effectiveExitLabel },
    { label: 'Positionsgröße', value: detail?.sizeLabel },
    { label: 'Geplantes Risiko', value: detail?.riskPlanLabel },
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
    { label: 'Review-Zustand', value: detail?.reviewState },
    { label: 'Emotion', value: detail?.emotion },
    { label: 'Setup-Qualität', value: detail?.quality },
    { label: 'Lesson', value: detail?.reviewLesson ?? detail?.lesson },
  ]

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d0d0d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-white/35">Trade Detail</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Trade in ruhigen Blöcken</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">Screenshot zuerst, dann Kernfakten, Risiko und Management in breiten Abschnitten statt in engen Bon-Streifen.</p>
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

      <div className="mt-5 overflow-hidden rounded-[28px] border border-[#c8823a]/16 bg-black/30 p-4">
        <div className="mx-auto w-full max-w-5xl">
        {detail?.screenshotUrl ? (
          <SetupImageLightbox
            src={detail.screenshotUrl}
            alt={`${detail.title} Screenshot`}
            badge={detail?.setup ?? 'Trade-Screenshot'}
            caption={detail?.date}
            hint="Klick für Großansicht"
            className="rounded-[24px] border border-white/10 bg-black/40"
            imageClassName="aspect-[16/6] w-full rounded-[24px] bg-[#050505] p-4 object-contain sm:aspect-[16/6] lg:aspect-[16/5]"
            dialogClassName="max-w-[min(99vw,2200px)]"
            dialogImageClassName="max-h-[96vh] w-full rounded-[1.65rem] object-contain"
          />
        ) : (
          <div className="flex aspect-[16/6] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/45 sm:aspect-[16/6] lg:aspect-[16/5]">
            Noch kein Screenshot hinterlegt.
          </div>
        )}
        </div>
      </div>

      <div className="mt-4 rounded-[28px] border border-white/10 bg-black/25 p-5 xl:p-6">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-white/35">Kernfakten</p>
          <p className="mt-2 text-sm leading-6 text-white/55">Das Wichtigste zum Trade zuerst, ohne dass kleine Faktenkacheln um Aufmerksamkeit kämpfen.</p>
        </div>
        <div className="mt-4">
          <DetailList items={primaryFacts} />
        </div>
      </div>

      <div className={`mt-4 rounded-[28px] border px-5 py-4 text-sm xl:px-6 ${trust?.tone === 'red' ? 'border-red-400/20 bg-red-400/10 text-red-100' : trust?.tone === 'orange' ? 'border-orange-400/20 bg-orange-400/10 text-orange-100/90' : trust?.tone === 'emerald' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-black/20 text-white/65'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-current/20 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]">{trust?.shortLabel ?? 'Hinweis'}</span>
          {trade?.pnlSource ? <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/75">P&amp;L {trade.pnlSource === 'derived' ? 'Auto' : trade.pnlSource === 'override' ? 'Override' : 'Manuell'}</span> : null}
          {trade?.completedAt ? <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70">Abgeschlossen</span> : null}
        </div>
        <p className="mt-3 leading-6">{trust?.description ?? detail?.captureTrustLabel ?? 'Kein zusätzlicher Hinweis zur Datenbasis vorhanden.'}</p>
        {trust?.items?.length ? (
          <ul className="mt-3 space-y-2 text-xs text-white/75">
            {trust.items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current/70" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <DetailSection
          title="Risiko & Management"
          subtitle="Hier liegen Margin, Hebel, Teilprofite und Restposition in einer ruhigen Arbeitsfläche statt hinter kleinen Kacheln."
          items={executionFacts}
        />
        <DetailSection
          title="Review & Learnings"
          subtitle="Nur die Review-Signale, die wirklich gesetzt wurden. So bleibt der Block leicht und trotzdem nützlich."
          items={reviewFacts}
        />

        <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 xl:p-6">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-white/35">Medien & Tags</p>
            <p className="mt-2 text-sm leading-6 text-white/55">Zusätzliche Bilder und Tags bleiben erreichbar, aber nicht mehr in einem zu schmalen Nebenfach.</p>
          </div>
          <div className="mt-4 space-y-4">
            {detail?.screenshotUrls?.length ? (
              <div>
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/35">Galerie · {detail.screenshotCount ?? detail.screenshotUrls.length}</p>
                <TradeImageGallery
                  images={detail.screenshotUrls.map((imageUrl, index) => ({ id: `${tradeId ?? detail.title}-image-${index}`, image_url: imageUrl }))}
                  tradeId={tradeId}
                  source={source}
                />
              </div>
            ) : (
              <p className="text-sm text-white/45">Keine zusätzlichen Trade-Bilder vorhanden.</p>
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
        </section>
      </div>
    </section>
  )
}
