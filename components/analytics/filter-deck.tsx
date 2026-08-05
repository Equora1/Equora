'use client'

import type { FilterState } from '@/lib/types/trade'
import { getTradeDateKey } from '@/lib/utils/trade-time'

type ChoiceFilterKey = Exclude<keyof FilterState, 'dateFrom' | 'dateTo'>

function FilterGroup({
  label,
  filterKey,
  values,
  filters,
  onChange,
  activeTone = 'orange',
  compact = false,
}: {
  label: string
  filterKey: ChoiceFilterKey
  values: string[]
  filters: FilterState
  onChange: (next: FilterState) => void
  activeTone?: 'orange' | 'emerald' | 'red'
  compact?: boolean
}) {
  const toneClass = activeTone === 'emerald'
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    : activeTone === 'red'
      ? 'border-red-400/25 bg-red-400/10 text-red-300'
      : 'border-orange-400/25 bg-orange-400/10 text-orange-100/85'

  return (
    <div className={`rounded-[26px] border border-white/10 ${compact ? 'bg-black/25 p-4' : 'bg-black/35 p-5'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{label}</p>
        {filters[filterKey] !== 'Alle' ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
            {filters[filterKey]}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {['Alle', ...values].map((value) => {
          const isActive = filters[filterKey] === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ...filters, [filterKey]: value })}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${isActive ? toneClass : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'}`}
            >
              {value}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function FilterDeck({
  filters,
  options,
  onChange,
  onReset,
}: {
  filters: FilterState
  options: { accounts: string[]; sessions: string[]; concepts: string[]; qualities: string[]; emotions: string[]; setups: string[] }
  onChange: (next: FilterState) => void
  onReset: () => void
}) {
  const activeCount = Object.entries(filters).filter(([, value]) => value !== 'Alle' && Boolean(value)).length
  const hasInvalidDateRange = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)

  return (
    <section className="rounded-[30px] border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.25em] text-white/45">Filter</p>
          <h2 className="mt-2 text-2xl font-semibold text-orange-300">Filter</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/65">
            {activeCount > 0 ? `${activeCount} Filter aktiv` : 'Alle Trades sichtbar'}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/80 transition hover:border-orange-400/35 hover:bg-orange-400/15"
          >
            Filter zurücksetzen
          </button>
        </div>
      </div>

      <div className={`mt-5 rounded-[26px] border p-4 ${hasInvalidDateRange ? 'border-red-400/25 bg-red-400/[0.06]' : 'border-orange-400/15 bg-black/35'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-orange-200/70">Auswertungszeitraum</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Nur Trades innerhalb dieses Zeitraums fließen in Kennzahlen, Vergleiche und Kurven ein. Das Journal selbst bleibt unverändert.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...filters, dateFrom: getTradeDateKey(new Date().toISOString()) ?? '' })}
                className="rounded-full border border-orange-300/20 bg-orange-400/[0.08] px-3 py-1.5 text-xs text-orange-100/85 transition hover:border-orange-300/40"
              >
                Ab heute auswerten
              </button>
              {filters.dateFrom || filters.dateTo ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, dateFrom: '', dateTo: '' })}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 transition hover:border-white/20 hover:text-white"
                >
                  Auswertungszeitraum zurücksetzen
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/55">
              <span className="mb-2 block uppercase tracking-[0.18em]">Von</span>
              <input
                type="date"
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })}
                className="min-h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-orange-300/40"
              />
            </label>
            <label className="text-xs text-white/55">
              <span className="mb-2 block uppercase tracking-[0.18em]">Bis</span>
              <input
                type="date"
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(event) => onChange({ ...filters, dateTo: event.target.value })}
                className="min-h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-orange-300/40"
              />
            </label>
          </div>
        </div>
        {hasInvalidDateRange ? (
          <p className="mt-3 text-sm text-red-200">Das Bis-Datum muss am oder nach dem Von-Datum liegen.</p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 rounded-[28px] border border-orange-400/15 bg-black/35 p-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-orange-200/70">Kernfilter</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <FilterGroup label="Konto" filterKey="account" values={options.accounts} filters={filters} onChange={onChange} activeTone="orange" />
            <FilterGroup label="Setup" filterKey="setup" values={options.setups} filters={filters} onChange={onChange} activeTone="orange" />
            <FilterGroup label="Konzept" filterKey="concept" values={options.concepts} filters={filters} onChange={onChange} activeTone="orange" />
            <FilterGroup label="Session" filterKey="session" values={options.sessions} filters={filters} onChange={onChange} activeTone="emerald" />
            <FilterGroup label="Qualität" filterKey="quality" values={options.qualities} filters={filters} onChange={onChange} activeTone="emerald" />
          </div>
        </div>

        <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Weitere Filter</p>
          </div>
          <FilterGroup label="Emotion" filterKey="emotion" values={options.emotions} filters={filters} onChange={onChange} activeTone="red" compact />
        </div>
      </div>
    </section>
  )
}
