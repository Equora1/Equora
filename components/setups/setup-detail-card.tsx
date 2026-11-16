'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { getTradeRValue, formatTradeRValue } from '@/lib/utils/trade-r'
import { useMemo, type ReactNode } from 'react'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import type { SetupDetail } from '@/lib/types/setup'
import type { Trade } from '@/lib/types/trade'
import type { SetupPerformanceRow } from '@/lib/utils/setup-analytics'
import { getSetupImageRoleLabel } from '@/components/setups/setup-studio-types'
import { getSetupPerformanceDisplay } from '@/lib/utils/setup-performance-display'
import { formatMoney } from '@/lib/utils/currency'

function formatPnL(trade: Trade, locale: JournalLocale) {
  const text = journalText(locale)
  if (trade.netPnL === undefined || trade.netPnL === null) return text('Offen', 'Open')
  if (trade.accountCurrencyStatus === 'unsupported') return text('Währung nicht unterstützt', 'Unsupported currency')
  return formatMoney(trade.netPnL, trade.accountCurrency, 0, locale)
}
export function SetupDetailCard({ title, data, linkedTrades, performance }: { title: string; data?: SetupDetail; linkedTrades: Trade[]; performance?: SetupPerformanceRow }) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const display = getSetupPerformanceDisplay(performance, locale)
  const imageItems = useMemo(
    () =>
      data?.exampleImageItems?.length
        ? data.exampleImageItems
        : (data?.exampleImages ?? []).map((url, index) => ({
            url,
            caption: undefined,
            isCover: index === 0,
            mediaRole: 'example' as const,
          })),
    [data],
  )
  const checklist = data?.checklist ?? []
  const mistakes = data?.mistakes ?? []
  const latestTrades = linkedTrades.slice(0, 5)

  return (
    <section className="rounded-3xl border border-[#221e1a] bg-[#0d0d0d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.25em] text-[#998a72]">{text('Setup-Regel', 'Setup rules')}</p>
          <h2 className="eq-display eq-text-gradient mt-3 text-[1.9rem] leading-none">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">{data?.playbook || text('Noch keine klare Setup-Idee hinterlegt.', 'No setup idea recorded yet.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill>{data?.category ?? 'Setup'}</Pill>
          <Pill>{linkedTrades.length} {linkedTrades.length === 1 ? 'Trade' : 'Trades'}</Pill>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <RuleSection eyebrow="Chart" title={text('Bild', 'Image')}>
            <div className="overflow-hidden rounded-2xl border border-[#c8823a]/20 bg-gradient-to-br from-[#c8823a]/10 to-transparent p-3">
              {data?.coverImage ? (
                <SetupImageLightbox locale={locale}
                  src={data.coverImage}
                  alt={text(`${title} Hauptbeispiel`, `${title} cover image`)}
                  badge="Cover"
                  caption={data.playbook ?? null}
                  hint={text('Großansicht', 'Enlarge')}
                  imageClassName="rounded-lg"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-black/30 text-sm text-[#998a72]">
                  {text('Kein Beispielbild hinterlegt', 'No example image yet')}
                </div>
              )}
            </div>
          </RuleSection>

          <RuleSection eyebrow={text('Leistung', 'Performance')} title={text('Stand', 'Overview')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <SignalMetric label="Trades" value={String(linkedTrades.length)} />
              <SignalMetric label="PF" value={display.profitFactor} />
              <SignalMetric label={text('Risiko', 'Risk')} value={display.riskCoverage} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <InfoBlock title={text('Trägt', 'What worked')}>{performance?.bestSession && performance.bestSession !== '—' ? `${performance.bestSession} · ${performance.bestMarket}` : text('Mehr Daten nötig.', 'More trades needed.')}</InfoBlock>
              <InfoBlock title={text('Prüfen', 'What to review')} tone={performance?.status === 'pause' || performance?.tone === 'red' ? 'danger' : 'neutral'}>{performance?.weakestSession && performance.weakestSession !== '—' ? `${performance.weakestSession} · ${performance.weakestMarket}` : text('Für einen Vergleich fehlen noch auswertbare Daten.', 'More usable trade results are needed to compare.')}</InfoBlock>
            </div>
            <p className="mt-3 rounded-2xl border border-[#c8823a]/18 bg-[#c8823a]/8 px-4 py-3 text-sm leading-6 text-[#f0a855]">
              {display.summary}
            </p>
          </RuleSection>
        </div>

        <div className="space-y-4">
          <RuleSection eyebrow={text('Regel', 'Rules')} title={text('Handeln', 'Trading rules')}>
            <div className="grid gap-3 md:grid-cols-2">
              <InfoBlock title="Entry">{data?.entry || text('Entry-Regel fehlt.', 'No entry rule yet.')}</InfoBlock>
              <InfoBlock title="Management">{data?.exit || text('Management-Regel fehlt.', 'No exit or management rule yet.')}</InfoBlock>
              <InfoBlock title={text('Invalidierung', 'Invalidation')} tone="danger">{data?.invalidation || text('Stop-Regel fehlt.', 'No invalidation rule yet.')}</InfoBlock>
              <InfoBlock title={text('Finger weg', 'When to skip')} tone="danger">{mistakes[0] || text('Fehlerquelle fehlt.', 'No common mistake recorded.')}</InfoBlock>
            </div>
          </RuleSection>

          <RuleSection eyebrow={text('Ausführung', 'Execution')} title={text('Check', 'Checklist')}>
            <div className="grid gap-3 md:grid-cols-2">
              <ListBlock title={text('Muss sitzen', 'Before entering')} items={checklist} empty={text('Keine Checkliste.', 'No checklist yet.')} />
              <ListBlock title={text('Fehlerquelle', 'Common mistakes')} items={mistakes} empty={text('Keine Fehler gesammelt.', 'No mistakes recorded yet.')} danger />
            </div>
          </RuleSection>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <RuleSection eyebrow={text('Beispiele', 'Examples')} title="Charts">
          {imageItems.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {imageItems.slice(0, 4).map((item, idx) => (
                <figure key={`${item.url}-${idx}`} className="overflow-hidden rounded-2xl border border-[#221e1a] bg-[#1f1c1a]/55">
                  <SetupImageLightbox locale={locale}
                    src={item.url}
                    alt={text(`${title} Beispiel ${idx + 1}`, `${title} example ${idx + 1}`)}
                    badge={getSetupImageRoleLabel(item.mediaRole, locale)}
                    caption={item.caption ?? null}
                    hint={text('Großansicht', 'Enlarge')}
                  />
                  <div className="flex items-center justify-between gap-2 p-3 text-[10px] uppercase tracking-[0.18em] text-[#998a72]">
                    <span>{getSetupImageRoleLabel(item.mediaRole, locale)}</span>
                    {item.isCover ? <span className="text-[#f0a855]">Cover</span> : null}
                  </div>
                  {item.caption ? <figcaption className="break-words px-3 pb-3 text-xs text-white/70">{item.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          ) : (
            <EmptyState text={text('Keine Bilder.', 'No images yet.')} />
          )}
        </RuleSection>

        <RuleSection eyebrow={text('Historie', 'History')} title={text('Verknüpfte Trades', 'Linked trades')}>
          <div className="space-y-2">
            {latestTrades.length ? (
              latestTrades.map((trade) => (
                <div key={trade.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-white">{trade.market} · {trade.session}</p>
                      <p className="mt-1 text-xs leading-5 text-[#998a72]">{trade.date} · {trade.emotion} · {trade.quality}</p>
                    </div>
                    <div className="text-right">
                      <span className={trade.netPnL === undefined || trade.netPnL === null ? 'text-[#998a72]' : trade.netPnL >= 0 ? 'text-[#f0a855]' : 'text-red-300'}>
                        {formatPnL(trade, locale)}
                      </span>
                      <p className="mt-1 text-[11px] text-white/35">{formatTradeRValue(getTradeRValue(trade), trade.rSource ?? 'missing', locale)}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState text={text('Keine verknüpften Trades.', 'No linked trades.')} />
            )}
          </div>
        </RuleSection>
      </div>
    </section>
  )
}

function RuleSection({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#221e1a] bg-[#1f1c1a]/55 p-4 xl:p-5">
      <p className="text-[10px] uppercase tracking-[0.24em] text-[#998a72]">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function InfoBlock({ title, children, tone = 'neutral' }: { title: string; children: ReactNode; tone?: 'neutral' | 'danger' }) {
  const className = tone === 'danger' ? 'border-[#e5484d]/18 bg-[#e5484d]/5 text-red-200/80' : 'border-white/10 bg-white/5 text-white/75'
  return (
    <div className={`rounded-2xl border px-4 py-4 ${className}`}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-[#998a72]">{title}</p>
      <p className="mt-3 text-sm leading-6">{children}</p>
    </div>
  )
}

function ListBlock({ title, items, empty, danger = false }: { title: string; items: string[]; empty: string; danger?: boolean }) {
  const itemClass = danger ? 'border-[#e5484d]/18 bg-[#e5484d]/5 text-red-200/80' : 'border-[#c8823a]/18 bg-[#c8823a]/8 text-[#f0a855]'
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div key={item} className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${itemClass}`}>
              {item}
            </div>
          ))
        ) : (
          <EmptyState text={empty} />
        )}
      </div>
    </div>
  )
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-[#c8823a]/20 bg-[#c8823a]/10 px-3 py-1 text-xs text-[#f0a855]">{children}</span>
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#998a72]">{text}</div>
}
