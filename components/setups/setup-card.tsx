import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { SetupPerformanceRow } from '@/lib/utils/setup-analytics'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'

type Setup = { category: string; title: string; description: string; isMaster?: boolean; isPersonal?: boolean }

function SetupArt({ category }: { category: string }) {
  return (
    <svg viewBox="0 0 320 180" className="aspect-video w-full">
      <rect x="0" y="0" width="320" height="180" rx="18" fill="rgba(255,255,255,0.03)" />
      <line x1="20" y1="150" x2="300" y2="150" stroke="rgba(255,255,255,0.10)" strokeDasharray="5 7" />
      <line x1="40" y1="20" x2="40" y2="160" stroke="rgba(255,255,255,0.07)" />

      {category === 'SMC' && (
        <>
          <path d="M40 110 L85 90 L120 98 L160 58 L198 68 L235 42 L280 56" fill="none" stroke="rgb(200,130,58)" strokeWidth="4" strokeLinecap="round" />
          <rect x="142" y="56" width="46" height="28" rx="8" fill="rgba(200,130,58,0.14)" stroke="rgba(240,168,85,0.55)" />
        </>
      )}

      {category === 'Price Action' && (
        <>
          <path d="M40 122 L95 68 L145 88 L188 54 L235 70 L280 45" fill="none" stroke="rgb(240,168,85)" strokeWidth="4" strokeLinecap="round" />
          <line x1="40" y1="86" x2="288" y2="86" stroke="rgba(240,168,85,0.35)" strokeDasharray="5 5" />
        </>
      )}

      {category === 'Momentum' && (
        <>
          <path d="M40 128 C 72 126, 88 118, 118 104 S 168 82, 196 68 S 244 44, 280 28" fill="none" stroke="rgb(240,168,85)" strokeWidth="5" strokeLinecap="round" />
          <path d="M248 38 L280 28 L268 58" fill="none" stroke="rgb(240,168,85)" strokeWidth="5" strokeLinecap="round" />
        </>
      )}

      {category === 'Mean Reversion' && (
        <>
          <path d="M42 78 C 88 42, 130 34, 174 60 S 242 120, 280 88" fill="none" stroke="rgb(229,72,77)" strokeWidth="4" strokeLinecap="round" />
          <line x1="40" y1="92" x2="286" y2="92" stroke="rgba(255,255,255,0.18)" strokeDasharray="5 7" />
        </>
      )}
    </svg>
  )
}


function CardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-[0.18em] text-white/32">{label}</p>
      <p className="mt-1 truncate text-[11px] font-semibold text-white/75">{value}</p>
    </div>
  )
}

function clipText(text: string, maxLength = 96) {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trim()}…`
}

function setupSourceLabel(setup: Setup) {
  if (setup.isMaster) return 'Master'
  if (setup.isPersonal) return 'Eigen'
  return 'Vorlage'
}

function actionSignal(setup: Setup) {
  const source = `${setup.title} ${setup.description} ${setup.category}`.toLowerCase()
  if (source.includes('reversal') || source.includes('mean') || source.includes('reclaim')) return 'Bestätigung abwarten'
  if (source.includes('breakout') || source.includes('momentum')) return 'Retest prüfen'
  if (source.includes('liquidity') || source.includes('sweep')) return 'Sweep bestätigen'
  return 'Regel prüfen'
}

export function SetupCard({ setup, coverImage, performance, isActive = false, onClick }: { setup: Setup; coverImage?: string; performance?: SetupPerformanceRow; isActive?: boolean; onClick?: () => void }) {
  const image = coverImage

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="block w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d0d]"
    >
      <FuturisticCard
        glow={isActive ? 'orange' : 'none'}
        className={`h-full p-4 transition duration-200 xl:p-5 ${
          isActive
            ? 'border-[#c8823a]/35 shadow-[0_0_22px_rgba(200,130,58,0.18)]'
            : 'hover:border-[#c8823a]/18 hover:bg-white/[0.05]'
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-full border border-[#c8823a]/20 bg-[#c8823a]/10 px-2.5 py-1 text-[11px] text-[#f0a855]">
            {setup.category}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-[#998a72]">{setupSourceLabel(setup)}</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#221e1a] bg-[#1f1c1a]/35 p-2">
          {image ? (
            <SetupImageLightbox
              src={image}
              alt={`${setup.title} Beispielchart`}
              badge={setup.category}
              hint="Großansicht"
              stopPropagation
              imageClassName="rounded-lg"
            />
          ) : (
            <SetupArt category={setup.category} />
          )}
        </div>

        <h3 className="mt-4 text-lg font-semibold tracking-tight text-white">{setup.title}</h3>
        <p className="mt-2 min-h-[3rem] text-sm leading-6 text-[#998a72]">{clipText(setup.description || 'Setup-Regeln prüfen.')}</p>

        <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 text-xs">
          {performance && performance.trades > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <CardMetric label="P&L" value={formatCurrency(performance.netPnL, 0, performance.currency)} />
                <CardMetric label="WR" value={`${performance.winRate.toFixed(0)}%`} />
                <CardMetric label="PF" value={performance.profitFactor === Infinity ? '∞' : performance.profitFactor.toFixed(2)} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-white/38">Risiko</span>
                <span className="text-right text-white/72">{performance.riskCoverage}% dokumentiert</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-white/38">Signal</span>
              <span className="text-right text-white/72">{actionSignal(setup)}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-white/38">Status</span>
            <span className={isActive ? 'text-[#f0a855]' : performance?.status === 'pause' ? 'text-red-200' : 'text-white/60'}>{performance?.statusLabel ?? (isActive ? 'Aktiv' : 'Details')}</span>
          </div>
          {performance && performance.trades > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-white/38">Ø R</span>
              <span className="text-right text-white/72">{formatRMultiple(performance.averageR)}</span>
            </div>
          ) : null}
        </div>
      </FuturisticCard>
    </div>
  )
}
