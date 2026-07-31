'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'

export function TradeCaptureDeck({
  quickCapture,
  fullCapture,
  importCapture,
  initialMode = 'none',
  closeHref,
}: {
  quickCapture: ReactNode
  fullCapture: ReactNode
  importCapture: ReactNode
  initialMode?: 'none' | 'quick' | 'full' | 'import'
  closeHref?: string
}) {
  const [mode, setMode] = useState<'none' | 'quick' | 'full' | 'import'>(initialMode)

  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncModeFromHash = () => {
      const hash = window.location.hash
      if (hash === '#trade-capture-quick') {
        setMode('quick')
        return
      }
      if (hash === '#trade-capture-full') {
        setMode('full')
        return
      }
      if (hash === '#trade-capture-import') {
        setMode('import')
        return
      }
      if (hash === '#trade-capture') {
        setMode((current) => (current === 'none' ? 'quick' : current))
      }
    }

    syncModeFromHash()
    window.addEventListener('hashchange', syncModeFromHash)
    return () => window.removeEventListener('hashchange', syncModeFromHash)
  }, [])

  const controls = [
    { key: 'quick' as const, label: 'Schnell', activeClass: 'border-orange-300/45 bg-orange-400/15 text-white', idleClass: 'border-orange-400/20 bg-black/30 text-orange-100/80 hover:border-orange-300/45 hover:text-white' },
    { key: 'import' as const, label: 'CSV / Excel importieren', activeClass: 'border-emerald-300/35 bg-emerald-400/15 text-white', idleClass: 'border-emerald-400/20 bg-black/30 text-emerald-100/80 hover:border-emerald-300/45 hover:text-white' },
    { key: 'full' as const, label: 'Vollständig', activeClass: 'border-white/25 bg-white/10 text-white', idleClass: 'border-white/10 bg-black/30 text-white/75 hover:border-white/20 hover:text-white' },
  ]

  return (
    <section id="trade-capture" className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold text-white">Erfassen</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {closeHref ? (
            <Link
              href={closeHref}
              prefetch={false}
              className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
            >
              Schließen
            </Link>
          ) : null}
          {controls.map((control) => {
            const isActive = mode === control.key
            return (
              <button
                key={control.key}
                type="button"
                onClick={() => setMode((current) => (current === control.key ? 'none' : control.key))}
                className={`rounded-full border px-4 py-2 text-sm transition ${isActive ? control.activeClass : control.idleClass}`}
              >
                {control.label}
              </button>
            )
          })}
        </div>
      </div>

      {mode === 'quick' ? <div className="mt-5" id="trade-capture-quick">{quickCapture}</div> : null}
      {mode === 'import' ? <div className="mt-5" id="trade-capture-import">{importCapture}</div> : null}
      {mode === 'full' ? <div className="mt-5" id="trade-capture-full">{fullCapture}</div> : null}
    </section>
  )
}
