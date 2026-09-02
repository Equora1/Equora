'use client'

import { useEffect, useRef } from 'react'
import { TradeDetailCard } from '@/components/trades/trade-detail-card'
import type { Trade, TradeDetail } from '@/lib/types/trade'

export function TradeDetailDrawer({
  trade,
  detail,
  tags,
  tradeId,
  tagOptions,
  source,
  isLoading,
  onClose,
  onDelete,
  isDeleting,
}: {
  trade?: Trade
  detail?: TradeDetail
  tags: Array<{ id: string; tag: string }>
  tradeId?: string
  tagOptions: string[]
  source: 'supabase' | 'mock'
  isLoading: boolean
  onClose: () => void
  onDelete: () => void
  isDeleting: boolean
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!tradeId) return

    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => {
        if (element.getAttribute('aria-hidden') === 'true' || element.offsetParent === null) return false

        let ancestor = element.parentElement
        while (ancestor && ancestor !== dialogRef.current) {
          if (ancestor.tagName === 'DETAILS' && !ancestor.hasAttribute('open')) {
            const ownSummary = ancestor.querySelector(':scope > summary')
            if (ownSummary !== element) return false
          }
          ancestor = ancestor.parentElement
        }

        const style = window.getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })

      if (!focusable.length) {
        event.preventDefault()
        closeButtonRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [onClose, tradeId])

  if (!tradeId) return null

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Trade-Details schließen"
        onClick={onClose}
        className="absolute inset-0 bg-black/72 backdrop-blur-sm"
      />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-detail-drawer-title"
        className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[30px] border border-white/12 bg-[#090909] shadow-[0_-24px_80px_rgba(0,0,0,0.72)] lg:inset-y-0 lg:left-auto lg:w-[min(720px,52vw)] lg:max-h-none lg:rounded-none lg:rounded-l-[32px] lg:shadow-[-24px_0_80px_rgba(0,0,0,0.72)]"
      >
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-[#090909]/95 px-5 py-4 backdrop-blur-xl sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#b09a7a]">Trade Detail</p>
            <h2 id="trade-detail-drawer-title" className="mt-1 truncate text-sm font-medium text-white">
              {trade ? `${trade.market} · ${trade.setup || 'Ohne Setup'}` : 'Trade wird geladen'}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl text-white/70 transition hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60"
            aria-label="Detailansicht schließen"
          >
            ×
          </button>
        </div>

        <div className="p-3 sm:p-5">
          {isLoading || !detail || !trade ? (
            <div role="status" className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="h-7 w-2/5 animate-pulse rounded-full bg-white/10" />
              <div className="h-32 animate-pulse rounded-[24px] bg-white/5" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-24 animate-pulse rounded-[24px] bg-white/5" />
                <div className="h-24 animate-pulse rounded-[24px] bg-white/5" />
              </div>
              <span className="sr-only">Trade-Details werden geladen.</span>
            </div>
          ) : (
            <TradeDetailCard
              detail={detail}
              trade={trade}
              tags={tags}
              tradeId={tradeId}
              tagOptions={tagOptions}
              source={source}
              onDelete={onDelete}
              isDeleting={isDeleting}
            />
          )}
        </div>
      </aside>
    </div>
  )
}
