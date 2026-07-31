'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PerformanceEvent } from '@/lib/types/performance'

type ApiResponse = { events: PerformanceEvent[]; generatedAt: string }

type OperationSummary = {
  name: string
  category: string
  count: number
  average: number
  p95: number
  maximum: number
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1))
  return sorted[index]
}

function summarize(events: PerformanceEvent[]): OperationSummary[] {
  const grouped = new Map<string, PerformanceEvent[]>()
  for (const event of events) {
    const key = `${event.category}:${event.name}`
    grouped.set(key, [...(grouped.get(key) ?? []), event])
  }
  return Array.from(grouped.values())
    .map((items) => {
      const values = items.map((item) => item.durationMs)
      return {
        name: items[0].name,
        category: items[0].category,
        count: items.length,
        average: values.reduce((sum, value) => sum + value, 0) / values.length,
        p95: percentile(values, 95),
        maximum: Math.max(...values),
      }
    })
    .sort((a, b) => b.p95 - a.p95)
}

function formatMs(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`
  return `${Math.round(value)} ms`
}

export function PerformanceDashboard() {
  const [events, setEvents] = useState<PerformanceEvent[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/performance?limit=300', { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) throw new Error(String(response.status))
      const data = await response.json() as ApiResponse
      setEvents(data.events)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(load, 2500)
    return () => window.clearInterval(timer)
  }, [autoRefresh, load])

  const summaries = useMemo(() => summarize(events), [events])
  const slowest = useMemo(() => [...events].sort((a, b) => b.durationMs - a.durationMs).slice(0, 15), [events])
  const lastTenMinutes = useMemo(() => {
    const floor = Date.now() - 10 * 60 * 1000
    return events.filter((event) => new Date(event.timestamp).getTime() >= floor)
  }, [events])
  const clientNavigations = lastTenMinutes.filter((event) => event.name === 'navigation.click_to_paint')
  const databaseEvents = lastTenMinutes.filter((event) => event.category === 'database')
  const authEvents = lastTenMinutes.filter((event) => event.category === 'auth')

  async function clear() {
    await fetch('/api/performance', { method: 'DELETE', credentials: 'same-origin' })
    setEvents([])
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-orange-400/18 bg-orange-400/[0.05] p-7 xl:p-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.26em] text-orange-100/65">Diagnose</p>
            <h1 className="eq-display mt-2 text-2xl text-white">Wo verliert Equora Zeit?</h1>
            <p className="mt-3 text-sm leading-6 text-white/58">Öffne nacheinander Start, Trades, Review, Statistik und Setups. Diese Seite sammelt nur Dauer, Operation und Mengen. Inhalte, Nutzer-IDs und API-Schlüssel werden nicht protokolliert.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={load} className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm text-white/75 transition hover:text-white">Aktualisieren</button>
            <button type="button" onClick={() => setAutoRefresh((value) => !value)} className="rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm text-white/75 transition hover:text-white">Auto: {autoRefresh ? 'an' : 'aus'}</button>
            <button type="button" onClick={clear} className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 py-2.5 text-sm text-red-100/80 transition hover:bg-red-400/[0.10]">Messungen leeren</button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Navigation Klick → Bild" value={clientNavigations.length ? formatMs(percentile(clientNavigations.map((event) => event.durationMs), 95)) : 'Noch messen'} detail={`${clientNavigations.length} Wechsel in 10 Min.`} />
        <Metric label="Datenbank P95" value={databaseEvents.length ? formatMs(percentile(databaseEvents.map((event) => event.durationMs), 95)) : 'Noch messen'} detail={`${databaseEvents.length} Abfragen in 10 Min.`} />
        <Metric label="Auth P95" value={authEvents.length ? formatMs(percentile(authEvents.map((event) => event.durationMs), 95)) : 'Noch messen'} detail={`${authEvents.length} Prüfungen in 10 Min.`} />
        <Metric label="Gespeicherte Messungen" value={String(events.length)} detail={state === 'error' ? 'API nicht erreichbar' : state === 'loading' ? 'Lädt …' : 'Maximal 300 Ereignisse'} />
      </section>

      <section className="rounded-[30px] border border-white/10 bg-black/25 p-5 xl:p-7">
        <h2 className="eq-display text-xl text-white">Langsamste Operationen</h2>
        <p className="mt-2 text-sm text-white/45">P95 zeigt, wie langsam 95 Prozent der Messungen höchstens waren. Hohe Werte mit vielen Wiederholungen sind die wichtigsten Kandidaten.</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.18em] text-white/35"><tr><th className="pb-3">Operation</th><th className="pb-3">Typ</th><th className="pb-3">Anzahl</th><th className="pb-3">Ø</th><th className="pb-3">P95</th><th className="pb-3">Maximum</th></tr></thead>
            <tbody className="divide-y divide-white/6">
              {summaries.slice(0, 18).map((item) => <tr key={`${item.category}:${item.name}`}><td className="py-3 pr-4 font-medium text-white/85">{item.name}</td><td className="py-3 pr-4 text-white/45">{item.category}</td><td className="py-3 pr-4 text-white/65">{item.count}</td><td className="py-3 pr-4 text-white/65">{formatMs(item.average)}</td><td className="py-3 pr-4 text-orange-100">{formatMs(item.p95)}</td><td className="py-3 text-white/65">{formatMs(item.maximum)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[30px] border border-white/10 bg-black/25 p-5 xl:p-7">
        <h2 className="eq-display text-xl text-white">Einzelne Ausreißer</h2>
        <div className="mt-5 space-y-2">
          {slowest.map((event) => (
            <div key={event.id} className="grid gap-2 rounded-2xl border border-white/7 bg-white/[0.02] px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
              <div className="min-w-0"><p className="truncate font-medium text-white/82">{event.name}</p><p className="mt-1 truncate text-xs text-white/35">{event.route ?? event.category}{event.meta ? ` · ${Object.entries(event.meta).map(([key, value]) => `${key}: ${value}`).join(' · ')}` : ''}</p></div>
              <span className="text-xs uppercase tracking-[0.16em] text-white/35">{new Date(event.timestamp).toLocaleTimeString('de-DE')}</span>
              <span className="font-semibold text-orange-100">{formatMs(event.durationMs)}</span>
            </div>
          ))}
          {!slowest.length ? <p className="rounded-2xl border border-white/7 bg-white/[0.02] px-4 py-5 text-sm text-white/45">Noch keine Messungen. Öffne zuerst einige Journal-Seiten.</p> : null}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-[26px] border border-white/9 bg-white/[0.025] p-5"><p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{value}</p><p className="mt-2 text-xs text-white/40">{detail}</p></div>
}
