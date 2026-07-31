'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const STORAGE_KEY = 'equora:navigation-start'

type NavigationStart = {
  from: string
  to: string
  startedAt: number
}

function sendMeasurement(payload: Record<string, unknown>) {
  fetch('/api/performance', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => undefined)
}

export function markEquoraNavigationStart(from: string, to: string) {
  if (typeof window === 'undefined') return
  const fromUrl = new URL(from, window.location.origin)
  const toUrl = new URL(to, window.location.origin)
  const value: NavigationStart = { from: fromUrl.pathname, to: toUrl.pathname, startedAt: performance.now() }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

export function PerformanceNavigationTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryKey = searchParams.toString() // dependency only; query values are never stored
  const route = pathname

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank' || target.hasAttribute('download')) return
      const destination = new URL(target.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      const current = `${window.location.pathname}${window.location.search}`
      const next = `${destination.pathname}${destination.search}`
      if (current === next || destination.pathname === '/logout') return
      markEquoraNavigationStart(current, next)
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [])

  useEffect(() => {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      try {
        const navigation = JSON.parse(raw) as NavigationStart
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            sendMeasurement({
              name: 'navigation.click_to_paint',
              category: 'client',
              durationMs: performance.now() - navigation.startedAt,
              route,
              meta: { from: navigation.from, to: navigation.to },
            })
          })
        })
      } catch {
        // Ignore stale or malformed local diagnostic data.
      }
    }
  }, [queryKey, route])

  useEffect(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (!navigation) return
    sendMeasurement({
      name: 'browser.initial_dom_interactive',
      category: 'client',
      durationMs: navigation.domInteractive,
      route,
      meta: {
        responseStart: Math.round(navigation.responseStart),
        domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
      },
    })
    // Initial navigation is recorded once per document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
