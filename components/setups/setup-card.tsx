import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import { FuturisticCard } from '@/components/ui/futuristic-card'

type Setup = { category: string; title: string; description: string }

function SetupArt({ category }: { category: string }) {
  return (
    <svg viewBox="0 0 320 180" className="aspect-video w-full">
      <rect x="0" y="0" width="320" height="180" rx="18" fill="rgba(255,255,255,0.03)" />
      <line x1="20" y1="150" x2="300" y2="150" stroke="rgba(255,255,255,0.10)" strokeDasharray="5 7" />
      <line x1="40" y1="20" x2="40" y2="160" stroke="rgba(255,255,255,0.07)" />

      {category === 'SMC' && (
        <>
          <path
            d="M40 110 L85 90 L120 98 L160 58 L198 68 L235 42 L280 56"
            fill="none"
            stroke="rgb(200,130,58)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <rect x="142" y="56" width="46" height="28" rx="8" fill="rgba(200,130,58,0.14)" stroke="rgba(240,168,85,0.55)" />
        </>
      )}

      {category === 'Price Action' && (
        <>
          <path
            d="M40 122 L95 68 L145 88 L188 54 L235 70 L280 45"
            fill="none"
            stroke="rgb(240,168,85)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <line x1="40" y1="86" x2="288" y2="86" stroke="rgba(240,168,85,0.35)" strokeDasharray="5 5" />
        </>
      )}

      {category === 'Momentum' && (
        <>
          <path
            d="M40 128 C 72 126, 88 118, 118 104 S 168 82, 196 68 S 244 44, 280 28"
            fill="none"
            stroke="rgb(240,168,85)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path d="M248 38 L280 28 L268 58" fill="none" stroke="rgb(240,168,85)" strokeWidth="5" strokeLinecap="round" />
        </>
      )}

      {category === 'Mean Reversion' && (
        <>
          <path
            d="M42 78 C 88 42, 130 34, 174 60 S 242 120, 280 88"
            fill="none"
            stroke="rgb(229,72,77)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <line x1="40" y1="92" x2="286" y2="92" stroke="rgba(255,255,255,0.18)" strokeDasharray="5 7" />
        </>
      )}
    </svg>
  )
}

export function SetupCard({ setup, coverImage, isActive = false, onClick }: { setup: Setup; coverImage?: string; isActive?: boolean; onClick?: () => void }) {
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
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded-full border border-[#c8823a]/20 bg-[#c8823a]/10 px-2.5 py-1 text-[11px] text-[#f0a855]">
            {setup.category}
          </span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#998a72]">Playbook</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#221e1a] bg-[#1f1c1a]/35 p-2">
          {image ? (
            <SetupImageLightbox
              src={image}
              alt={`${setup.title} Beispielchart`}
              badge={setup.category}
              hint="Klick oder Doppelklick für Großansicht"
              stopPropagation
              imageClassName="rounded-lg"
            />
          ) : (
            <SetupArt category={setup.category} />
          )}
        </div>

        <h3 className="mt-4 text-lg font-semibold tracking-tight text-white">{setup.title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#998a72]">{setup.description}</p>
        <div className="mt-4 flex items-center justify-between text-xs text-[#998a72]">
          <span>{image ? 'Bild vergrößerbar' : 'Mehr Raum für Beispiele'}</span>
          <span>{isActive ? 'Aktiv' : 'Details'}</span>
        </div>
      </FuturisticCard>
    </div>
  )
}
