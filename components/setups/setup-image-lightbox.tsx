'use client'

import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import Image from 'next/image'
import { useEffect, useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react'

type SetupImageLightboxProps = {
  src: string
  alt: string
  caption?: string | null
  badge?: string | null
  hint?: string
  locale?: JournalLocale
  className?: string
  imageClassName?: string
  stopPropagation?: boolean
  dialogClassName?: string
  dialogImageClassName?: string
}

function joinClasses(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(' ')
}

export function SetupImageLightbox({
  src,
  alt,
  caption,
  badge,
  hint,
  locale = 'de',
  className,
  imageClassName,
  stopPropagation = false,
  dialogClassName,
  dialogImageClassName,
}: SetupImageLightboxProps) {
  const text = journalText(locale)
  const [isOpen, setIsOpen] = useState(false)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!isOpen) return

    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleWindowKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [isOpen])

  const detailLine = useMemo(() => {
    if (badge && caption) return `${badge} · ${caption}`
    return badge || caption || journalText(locale)('Mit Escape oder einem Klick neben das Bild wieder schließen.', 'Press Escape or click outside the image to close.')
  }, [badge, caption, locale])

  function handleTriggerEvent(event: MouseEvent<HTMLButtonElement>) {
    if (stopPropagation) {
      event.stopPropagation()
    }

    setIsOpen(true)
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (stopPropagation) {
      event.stopPropagation()
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setIsOpen(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleTriggerEvent}
        onDoubleClick={handleTriggerEvent}
        onKeyDown={handleTriggerKeyDown}
        className={joinClasses(
          'group relative block w-full overflow-hidden rounded-xl text-left outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-[#f0a855]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d0d]',
          className,
        )}
        aria-label={text(`${alt} in Großansicht öffnen`, `Enlarge ${alt}`)}
      >
        <Image unoptimized src={src} alt={alt} width={1280} height={720} sizes="(min-width: 1024px) 640px, 100vw" className={joinClasses('aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.015]', imageClassName)} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent px-3 py-3 opacity-100 transition duration-200 md:opacity-0 md:group-hover:opacity-100">
          <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-white/78">
            <span>{hint ?? text('Klick oder Doppelklick für Großansicht', 'Click to enlarge')}</span>
            <span>Zoom</span>
          </div>
        </div>
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/92 px-2 py-3 backdrop-blur-md md:px-4 md:py-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onClick={() => setIsOpen(false)}
        >
          <div className={joinClasses('relative w-full max-w-[min(99vw,2200px)]', dialogClassName)} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-sm font-medium text-white transition hover:border-[#f0a855]/55 hover:text-[#f0a855]"
            >
              {text('Schließen', 'Close')}
            </button>

            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#070707] shadow-[0_32px_120px_rgba(0,0,0,0.68)]">
              <div className="border-b border-white/10 px-5 py-4 pr-24 md:px-6">
                <p id={titleId} className="text-sm font-semibold tracking-[0.06em] text-white">
                  {alt}
                </p>
                <p id={descriptionId} className="mt-1 text-sm text-white/60">
                  {detailLine}
                </p>
              </div>
              <div className="bg-[#040404] p-2 md:p-3">
                <Image unoptimized src={src} alt={alt} width={1920} height={1080} sizes="100vw" className={joinClasses('max-h-[96vh] w-full rounded-[1.65rem] object-contain', dialogImageClassName)} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
