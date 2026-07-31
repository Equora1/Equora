'use client'

import { useMemo, type ReactNode } from 'react'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import type { SetupDetail } from '@/lib/types/setup'
import type { Trade } from '@/lib/types/trade'
import type { SetupPerformanceRow } from '@/lib/utils/setup-analytics'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'


function formatProfitFactor(value: number) {
  if (value === Infinity) return '∞'
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

function getMediaRoleLabel(role?: string | null) {
  switch (role) {
    case 'best-practice':
      return 'Sauber'
    case 'mistake':
      return 'Fehler'
    default:
      return 'Beispiel'
  }
}

function formatPnL(value: number | null | undefined) {
  if (value === undefined || value === null) return 'Offen'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`
}

export function SetupDetailCard({ title, data, linkedTrades, performance }: { title: string; data?: SetupDetail; linkedTrades: Trade[]; performance?: SetupPerformanceRow }) {
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
          <p className="text-xs uppercase tracking-[0.25em] text-[#998a72]">Setup-Regel</p>
          <h2 className="eq-display eq-text-gradient mt-3 text-[1.9rem] leading-none">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">{data?.playbook || 'Noch keine klare Setup-Idee hinterlegt.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill>{data?.category ?? 'Setup'}</Pill>
          <Pill>{linkedTrades.length} Trades</Pill>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <RuleSection eyebrow="Chart" title="Bild">
            <div className="overflow-hidden rounded-2xl border border-[#c8823a]/20 bg-gradient-to-br from-[#c8823a]/10 to-transparent p-3">
              {data?.coverImage ? (
                <SetupImageLightbox
                  src={data.coverImage}
                  alt={`${title} Hauptbeispiel`}
                  badge="Cover"
                  caption={data.playbook ?? null}
                  hint="Großansicht"
                  imageClassName="rounded-lg"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-black/30 text-sm text-[#998a72]">
                  Kein Beispielbild hinterlegt
                </div>
              )}
            </div>
          </RuleSection>

          <RuleSection eyebrow="Leistung" title="Stand">
            <div className="grid gap-3 sm:grid-cols-3">
              <SignalMetric label="Trades" value={String(linkedTrades.length)} />
              <SignalMetric label="PF" value={performance && performance.trades > 0 ? formatProfitFactor(performance.profitFactor) : '—'} />
              <SignalMetric label="Risiko" value={performance && performance.trades > 0 ? `${performance.riskCoverage}%` : '—'} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <InfoBlock title="Trägt">{performance?.bestSession && performance.bestSession !== '—' ? `${performance.bestSession} · ${performance.bestMarket}` : 'Mehr Daten nötig.'}</InfoBlock>
              <InfoBlock title="Prüfen" tone={performance?.status === 'pause' || performance?.tone === 'red' ? 'danger' : 'neutral'}>{performance?.weakestSession && performance.weakestSession !== '—' ? `${performance.weakestSession} · ${performance.weakestMarket}` : 'Keine Schwäche sichtbar.'}</InfoBlock>
            </div>
            <p className="mt-3 rounded-2xl border border-[#c8823a]/18 bg-[#c8823a]/8 px-4 py-3 text-sm leading-6 text-[#f0a855]">
              {performance && performance.trades > 0
                ? `${formatCurrency(performance.netPnL)} · ${performance.winRate.toFixed(0)}% Winrate · ${formatRMultiple(performance.averageR)} · ${performance.statusHint}`
                : data?.performance || 'Noch keine Performance-Daten.'}
            </p>
          </RuleSection>
        </div>

        <div className="space-y-4">
          <RuleSection eyebrow="Regel" title="Handeln">
            <div className="grid gap-3 md:grid-cols-2">
              <InfoBlock title="Entry">{data?.entry || 'Entry-Regel fehlt.'}</InfoBlock>
              <InfoBlock title="Management">{data?.exit || 'Management-Regel fehlt.'}</InfoBlock>
              <InfoBlock title="Invalidierung" tone="danger">{data?.invalidation || 'Stop-Regel fehlt.'}</InfoBlock>
              <InfoBlock title="Finger weg" tone="danger">{mistakes[0] || 'Fehlerquelle fehlt.'}</InfoBlock>
            </div>
          </RuleSection>

          <RuleSection eyebrow="Ausführung" title="Check">
            <div className="grid gap-3 md:grid-cols-2">
              <ListBlock title="Muss sitzen" items={checklist} empty="Keine Checkliste." />
              <ListBlock title="Fehlerquelle" items={mistakes} empty="Keine Fehler gesammelt." danger />
            </div>
          </RuleSection>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <RuleSection eyebrow="Beispiele" title="Charts">
          {imageItems.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {imageItems.slice(0, 4).map((item, idx) => (
                <div key={`${item.url}-${idx}`} className="overflow-hidden rounded-2xl border border-[#221e1a] bg-[#1f1c1a]/55">
                  <SetupImageLightbox
                    src={item.url}
                    alt={`${title} Beispiel ${idx + 1}`}
                    badge={getMediaRoleLabel(item.mediaRole)}
                    caption={item.caption ?? null}
                    hint="Großansicht"
                  />
                  <div className="flex items-center justify-between gap-2 p-3 text-[10px] uppercase tracking-[0.18em] text-[#998a72]">
                    <span>{getMediaRoleLabel(item.mediaRole)}</span>
                    {item.isCover ? <span className="text-[#f0a855]">Cover</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="Keine Bilder." />
          )}
        </RuleSection>

        <RuleSection eyebrow="Historie" title="Verknüpfte Trades">
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
                        {formatPnL(trade.netPnL)}
                      </span>
                      <p className="mt-1 text-[11px] text-white/35">{trade.rMultiple ?? trade.rValue ? formatRMultiple(trade.rMultiple ?? trade.rValue ?? 0) : 'R offen'}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState text="Keine verknüpften Trades." />
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
