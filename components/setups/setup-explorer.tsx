'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SectionHeader } from '@/components/layout/section-header'
import { SetupCard } from '@/components/setups/setup-card'
import { SetupDetailCard } from '@/components/setups/setup-detail-card'
import type { SavedSetup, SetupDetail, SetupLibraryItem } from '@/lib/types/setup'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { getTradesForSetupTitle, type SetupPerformanceRow } from '@/lib/utils/setup-analytics'
import type { Trade } from '@/lib/types/trade'

type LibraryView = 'all' | 'master' | 'own'

export function SetupExplorer({
  setupLibrary,
  setupDetails,
  trades,
  savedSetups,
  setupPerformanceRows,
  canManageMaster = false,
}: {
  setupLibrary: SetupLibraryItem[]
  setupDetails: Record<string, SetupDetail | undefined>
  trades: Trade[]
  savedSetups: SavedSetup[]
  setupPerformanceRows: SetupPerformanceRow[]
  canManageMaster?: boolean
}) {
  const hasMasterSetups = setupLibrary.some((setup) => setup.isMaster)
  const hasPersonalSetups = setupLibrary.some((setup) => setup.isPersonal)
  const [libraryView, setLibraryView] = useState<LibraryView>(hasMasterSetups ? 'master' : 'all')
  const visibleSetups = useMemo(() => {
    if (libraryView === 'master') return setupLibrary.filter((setup) => setup.isMaster)
    if (libraryView === 'own') return setupLibrary.filter((setup) => setup.isPersonal)
    return setupLibrary
  }, [libraryView, setupLibrary])
  const [selectedSetup, setSelectedSetup] = useState(visibleSetups[0]?.title || setupLibrary[0]?.title || 'Liquidity Sweep')

  useEffect(() => {
    if (!visibleSetups.length) {
      setSelectedSetup(setupLibrary[0]?.title || 'Liquidity Sweep')
      return
    }
    if (!visibleSetups.some((setup) => setup.title === selectedSetup)) setSelectedSetup(visibleSetups[0].title)
  }, [selectedSetup, setupLibrary, visibleSetups])

  const linkedTrades = useMemo(() => getTradesForSetupTitle(selectedSetup, trades, savedSetups), [selectedSetup, trades, savedSetups])
  const selectedLibraryItem = setupLibrary.find((setup) => setup.title === selectedSetup)
  const selectedDetail = setupDetails[selectedSetup]
  const selectedPerformance = setupPerformanceRows.find((row) => row.title === selectedSetup)
  const strongestSetups = setupPerformanceRows.filter((row) => row.trades > 0).slice(0, 4)
  const weakestSetup = [...setupPerformanceRows].filter((row) => row.trades > 0).sort((left, right) => left.netPnL - right.netPnL || right.trades - left.trades)[0]
  const activeStatusTone = selectedPerformance?.status === 'pause'
    ? 'border-red-300/18 bg-red-400/[0.06] text-red-100/82'
    : selectedPerformance?.status === 'active'
      ? 'border-emerald-300/18 bg-emerald-400/[0.06] text-emerald-100/82'
      : 'border-orange-300/18 bg-orange-400/[0.07] text-orange-100/82'
  const selectedSavedSetup = savedSetups.find((setup) => setup.title === selectedSetup)
  const canEditSelectedMedia = Boolean(selectedSavedSetup && (!selectedSavedSetup.isMaster || canManageMaster))
  const isAdminEditingMaster = Boolean(selectedSavedSetup?.isMaster && canManageMaster)

  function handleMediaEdit(copyAsOwn: boolean) {
    const detail = setupDetails[selectedSetup]
    const media = (detail?.exampleImageItems?.length ? detail.exampleImageItems : (detail?.exampleImages ?? []).map((url, index) => ({ url, isCover: index === 0, mediaRole: 'example' as const })))
    const event = new CustomEvent('equora:setup-media-edit', {
      detail: {
        setupId: copyAsOwn ? null : selectedSavedSetup?.id ?? null,
        copyAsOwn,
        title: selectedSetup,
        category: detail?.category ?? selectedLibraryItem?.category ?? 'Custom',
        description: selectedLibraryItem?.description ?? '',
        entry: detail?.entry ?? '',
        exit: detail?.exit ?? '',
        invalidation: detail?.invalidation ?? '',
        playbook: detail?.playbook ?? selectedLibraryItem?.description ?? '',
        checklist: detail?.checklist ?? [],
        mistakes: detail?.mistakes ?? [],
        media,
      },
    })
    window.dispatchEvent(event)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#221e1a] bg-[#0d0d0d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-6">
        <SectionHeader
          eyebrow="Setup-Bibliothek"
          title="Trading-Landkarte"
          copy=""
          badge={`${visibleSetups.length} sichtbar`}
        />

        {(hasMasterSetups || hasPersonalSetups) ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <LibraryTab label="Alle" active={libraryView === 'all'} onClick={() => setLibraryView('all')} />
            {hasMasterSetups ? <LibraryTab label="Master" active={libraryView === 'master'} onClick={() => setLibraryView('master')} /> : null}
            {hasPersonalSetups ? <LibraryTab label="Eigene" active={libraryView === 'own'} onClick={() => setLibraryView('own')} /> : null}
          </div>
        ) : null}

        <div className="mt-5 rounded-3xl border border-orange-400/15 bg-orange-400/[0.05] p-5 xl:p-6">
          <div className="flex flex-col gap-5">
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-100/55">Aktive Regel</p>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <h3 className="text-2xl font-semibold text-white xl:text-[2rem]">{selectedSetup}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/60">
                    {selectedLibraryItem?.description || 'Regel prüfen.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedLibraryItem?.isMaster ? <Badge label="Master" /> : null}
                  {selectedLibraryItem?.isPersonal ? <Badge label="Eigen" /> : null}
                  <Badge label={selectedDetail?.category ?? selectedLibraryItem?.category ?? 'Setup'} />
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              <Metric label="Trades" value={String(linkedTrades.length)} note={selectedPerformance ? `${selectedPerformance.resolvedTrades} erledigt · ${selectedPerformance.openTrades} offen` : 'Historie'} />
              <Metric label="P&L" value={selectedPerformance ? formatCurrency(selectedPerformance.netPnL, 0, selectedPerformance.currency) : '—'} note={selectedPerformance?.verdict ?? 'Noch keine Daten'} />
              <Metric label="Winrate" value={selectedPerformance ? `${selectedPerformance.winRate.toFixed(0)}%` : '—'} note={selectedPerformance ? `${selectedPerformance.wins}W · ${selectedPerformance.losses}L · ${selectedPerformance.breakeven}BE` : 'Offen'} />
              <Metric label="PF / Ø R" value={selectedPerformance ? `${formatProfitFactor(selectedPerformance.profitFactor)} · ${formatRMultiple(selectedPerformance.averageR)}` : '—'} note={selectedPerformance ? `${selectedPerformance.riskCoverage}% Risiko dokumentiert` : 'Regel prüfen'} />
            </div>

            {selectedPerformance ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${activeStatusTone}`}>
                <span className="font-semibold">{selectedPerformance.statusLabel}.</span> {selectedPerformance.statusHint}
                {selectedPerformance.lastTradeDate ? ` Letzter Trade: ${selectedPerformance.lastTradeDate}${selectedPerformance.lastTradePnL !== null ? ` · ${formatCurrency(selectedPerformance.lastTradePnL, 0, selectedPerformance.currency)}` : ''}.` : ''}
              </div>
            ) : null}

            {selectedPerformance && selectedPerformance.trades > 0 ? (
              <div className="grid gap-3 md:grid-cols-3">
                <MiniSignal label="Stark" value={selectedPerformance.bestSession} note={selectedPerformance.bestMarket} />
                <MiniSignal label="Prüfen" value={selectedPerformance.weakestSession} note={selectedPerformance.weakestMarket} />
                <MiniSignal label="Kosten" value={selectedPerformance.costScopeKind === 'single' ? formatCurrency(selectedPerformance.totalCosts, 0, selectedPerformance.costCurrency) : 'Gesperrt'} note={selectedPerformance.costScopeKind === 'single' ? `${formatCurrency(selectedPerformance.averageCost, 0, selectedPerformance.costCurrency)} je Trade` : 'Währungen fehlen oder sind gemischt'} />
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/58">
              {isAdminEditingMaster
                ? 'Admin-Modus aktiv. Du bearbeitest die Master-Bilder direkt. Änderungen ersetzen die Dummy-Bilder dauerhaft für alle.'
                : canEditSelectedMedia
                  ? 'Dieses Setup gehört dir. Bilder kannst du direkt bearbeiten.'
                  : 'Vorlage bleibt geschützt. Mit „Kopie bearbeiten“ übernimmst du Regel und Dummy-Bilder in deine eigene Version.'}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/trades?setup=${encodeURIComponent(selectedSetup)}`}
                className="rounded-full border border-orange-300/25 bg-orange-400/10 px-4 py-2 text-xs font-medium text-orange-100 transition hover:border-orange-200/45"
              >
                Trades anzeigen
              </Link>
              <Link
                href={`/statistik?layer=setups&setup=${encodeURIComponent(selectedSetup)}`}
                className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-medium text-white/65 transition hover:border-white/20 hover:text-white"
              >
                Setup auswerten
              </Link>
              {canEditSelectedMedia ? (
                <button
                  type="button"
                  onClick={() => handleMediaEdit(false)}
                  className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-200/40"
                >
                  {isAdminEditingMaster ? 'Master-Bilder bearbeiten' : 'Bilder bearbeiten'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleMediaEdit(true)}
                  className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-200/40"
                >
                  Kopie bearbeiten
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[#221e1a] bg-[#0d0d0d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#998a72]">Setup-Wirkung</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Was trägt, was kostet</h3>
          </div>
          {weakestSetup ? <div className="rounded-full border border-red-300/15 bg-red-400/[0.06] px-3 py-1 text-xs text-red-100/80">Prüfen: {weakestSetup.title}</div> : null}
        </div>

        {strongestSetups.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {strongestSetups.map((row) => (
              <SetupPerformanceTile key={row.title} row={row} active={selectedSetup === row.title} onClick={() => setSelectedSetup(row.title)} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#998a72]">Noch keine Setup-Historie.</div>
        )}
      </section>

      <SetupDetailCard title={selectedSetup} data={selectedDetail} linkedTrades={linkedTrades} performance={selectedPerformance} />

      <section className="rounded-3xl border border-[#221e1a] bg-[#0d0d0d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#998a72]">Auswahl</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Master, eigene Muster, Vorlagen</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#998a72]">
            {visibleSetups.length} Setups
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleSetups.map((setup) => (
            <SetupCard
              key={setup.title}
              setup={setup}
              coverImage={setupDetails[setup.title]?.coverImage}
              performance={setupPerformanceRows.find((row) => row.title === setup.title)}
              isActive={selectedSetup === setup.title}
              onClick={() => setSelectedSetup(setup.title)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}


function formatProfitFactor(value: number) {
  if (value === Infinity) return '∞'
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

function SetupPerformanceTile({ row, active, onClick }: { row: SetupPerformanceRow; active: boolean; onClick: () => void }) {
  const toneClass = row.tone === 'green'
    ? 'border-emerald-400/24 bg-emerald-400/[0.08]'
    : row.tone === 'red'
      ? 'border-red-400/22 bg-red-400/[0.065]'
      : 'border-white/10 bg-black/22'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[22px] border p-4 text-left transition hover:border-orange-300/35 ${toneClass} ${active ? 'ring-1 ring-orange-300/35' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{row.title}</p>
          <p className="mt-1 text-xs text-white/45">{row.trades} Trades</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-white/58">{row.winRate.toFixed(0)}%</span>
      </div>
      <p className="mt-4 whitespace-nowrap text-2xl font-semibold tabular-nums text-white">{formatCurrency(row.netPnL, 0, row.currency)}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/58">
        <span>PF {formatProfitFactor(row.profitFactor)}</span>
        <span>ØR {formatRMultiple(row.averageR)}</span>
        <span>{row.riskCoverage}% Risiko</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-white/55">{row.statusHint}</p>
    </button>
  )
}


function MiniSignal({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-white">{value || '—'}</p>
      <p className="mt-1 truncate text-xs text-white/45">{note || '—'}</p>
    </div>
  )
}

function LibraryTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${active ? 'border-orange-400/30 bg-orange-400/10 text-orange-100' : 'border-white/10 bg-black/20 text-white/65 hover:border-white/20 hover:text-white'}`}
    >
      {label}
    </button>
  )
}

function Badge({ label }: { label: string }) {
  return <span className="inline-flex rounded-full border border-[#c8823a]/25 bg-[#c8823a]/10 px-3 py-1 text-xs text-[#f0a855]">{label}</span>
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <div className="mt-3 flex flex-col gap-1">
        <p className="text-lg font-semibold text-white">{value}</p>
        <p className="text-xs leading-5 text-white/45">{note}</p>
      </div>
    </div>
  )
}
