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

  return (
    <section id="trade-capture" className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-white/40">Trade Capture</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Nur öffnen, wenn du wirklich etwas sichern willst</h2>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Die Tabelle bleibt dein Hauptarbeitsplatz. Capture öffnet sich erst bei Bedarf.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {closeHref ? (
            <Link
              href={closeHref}
              prefetch={false}
              className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
            >
              Editor schließen
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setMode((current) => (current === 'quick' ? 'none' : 'quick'))}
            className={`rounded-full border px-4 py-2 text-sm transition ${mode === 'quick' ? 'border-orange-300/45 bg-orange-400/15 text-white' : 'border-orange-400/20 bg-black/30 text-orange-100/80 hover:border-orange-300/45 hover:text-white'}`}
          >
            {mode === 'quick' ? 'Snip schließen' : 'Snip / Schnell erfassen'}
          </button>
          <button
            type="button"
            onClick={() => setMode((current) => (current === 'import' ? 'none' : 'import'))}
            className={`rounded-full border px-4 py-2 text-sm transition ${mode === 'import' ? 'border-emerald-300/35 bg-emerald-400/15 text-white' : 'border-emerald-400/20 bg-black/30 text-emerald-100/80 hover:border-emerald-300/45 hover:text-white'}`}
          >
            {mode === 'import' ? 'Import schließen' : 'CSV Import öffnen'}
          </button>
          <button
            type="button"
            onClick={() => setMode((current) => (current === 'full' ? 'none' : 'full'))}
            className={`rounded-full border px-4 py-2 text-sm transition ${mode === 'full' ? 'border-white/25 bg-white/10 text-white' : 'border-white/10 bg-black/30 text-white/75 hover:border-white/20 hover:text-white'}`}
          >
            {mode === 'full' ? 'Voll-Trade schließen' : 'Voll-Trade öffnen'}
          </button>
        </div>
      </div>

      {mode === 'none' ? (
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <MiniHint title="Workspace zuerst" body="Erst finden und auswählen. Capture bleibt ruhig im Hintergrund." />
          <MiniHint title="Snip sichern" body="Screenshot sichern, Kernfakten dazu, später vervollständigen." />
          <MiniHint title="CSV übernehmen" body="Datei prüfen, Zeilen mappen und direkt ins Arbeitsbrett holen." />
          <MiniHint title="Voll nur für Ausnahmen" body="Nur wenn du wirklich sofort tiefer einsteigen willst." />
        </div>
      ) : null}

      {mode === 'quick' ? <div className="mt-5" id="trade-capture-quick">{quickCapture}</div> : null}
      {mode === 'import' ? <div className="mt-5" id="trade-capture-import">{importCapture}</div> : null}
      {mode === 'full' ? <div className="mt-5" id="trade-capture-full">{fullCapture}</div> : null}
    </section>
  )
}

function MiniHint({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/65">{body}</p>
    </div>
  )
}
