'use client'

import { journalText, type JournalLocale } from '@/lib/i18n/journal'
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
  valueLabels,
  locale,
}: {
  label: string
  filterKey: ChoiceFilterKey
  values: string[]
  filters: FilterState
  onChange: (next: FilterState) => void
  activeTone?: 'orange' | 'emerald' | 'red'
  compact?: boolean
  valueLabels?: ReadonlyMap<string, string>
  locale: JournalLocale
}) {
  const text = journalText(locale)
  const selectedValue = filters[filterKey] ?? 'Alle'
  const toneClass = activeTone === 'emerald'
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    : activeTone === 'red'
      ? 'border-red-400/25 bg-red-400/10 text-red-300'
      : 'border-orange-400/25 bg-orange-400/10 text-orange-100/85'

  return (
    <div className={`rounded-[26px] border border-white/10 ${compact ? 'bg-black/25 p-4' : 'bg-black/35 p-5'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{label}</p>
        {selectedValue !== 'Alle' ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
            {valueLabels?.get(selectedValue) ?? selectedValue}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {['Alle', ...values].map((value) => {
          const isActive = selectedValue === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ...filters, [filterKey]: value })}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${isActive ? toneClass : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white'}`}
            >
              {value === 'Alle' ? text('Alle', 'All') : valueLabels?.get(value) ?? value}
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
  accountLabels,
  locale = 'de',
}: {
  filters: FilterState
  options: { accounts: string[]; sessions: string[]; concepts: string[]; qualities: string[]; emotions: string[]; setups: string[] }
  onChange: (next: FilterState) => void
  onReset: () => void
  accountLabels?: ReadonlyMap<string, string>
  locale?: JournalLocale
}) {
  const text = journalText(locale)
  const activeCount = Object.entries(filters).filter(([, value]) => value !== 'Alle' && Boolean(value)).length
  const hasInvalidDateRange = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)

  return (
    <section className="rounded-[30px] border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h2 className="mt-2 text-2xl font-semibold text-orange-300">{text('Filter', 'Filters')}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/65">
            {activeCount > 0 ? text(`${activeCount} Filter aktiv`, `${activeCount} active ${activeCount === 1 ? 'filter' : 'filters'}`) : text('Alle Trades sichtbar', 'Showing all trades')}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/80 transition hover:border-orange-400/35 hover:bg-orange-400/15"
          >
            {text('Filter zurücksetzen', 'Reset filters')}
          </button>
        </div>
      </div>

      <div className={`mt-5 rounded-[26px] border p-4 ${hasInvalidDateRange ? 'border-red-400/25 bg-red-400/[0.06]' : 'border-orange-400/15 bg-black/35'}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-orange-200/70">{text('Auswertungszeitraum', 'Analysis period')}</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              {text('Nur Trades innerhalb dieses Zeitraums fließen in Kennzahlen, Vergleiche und Kurven ein. Das Journal selbst bleibt unverändert.', 'The analysis uses trades within this date range.')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...filters, dateFrom: getTradeDateKey(new Date().toISOString()) ?? '' })}
                className="rounded-full border border-orange-300/20 bg-orange-400/[0.08] px-3 py-1.5 text-xs text-orange-100/85 transition hover:border-orange-300/40"
              >
                {text('Ab heute auswerten', 'Start from today')}
              </button>
              {filters.dateFrom || filters.dateTo ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...filters, dateFrom: '', dateTo: '' })}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 transition hover:border-white/20 hover:text-white"
                >
                  {text('Auswertungszeitraum zurücksetzen', 'Clear date range')}
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/55">
              <span className="mb-2 block uppercase tracking-[0.18em]">{text('Von', 'From')}</span>
              <input
                type="date"
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })}
                className="min-h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-orange-300/40"
              />
            </label>
            <label className="text-xs text-white/55">
              <span className="mb-2 block uppercase tracking-[0.18em]">{text('Bis', 'To')}</span>
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
          <p className="mt-3 text-sm text-red-200">{text('Das Bis-Datum muss am oder nach dem Von-Datum liegen.', 'The end date must be on or after the start date.')}</p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 rounded-[28px] border border-orange-400/15 bg-black/35 p-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-orange-200/70">{text('Kernfilter', 'Main filters')}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <FilterGroup locale={locale} label={text('Konto', 'Account')} filterKey="account" valueLabels={accountLabels} values={options.accounts} filters={filters} onChange={onChange} activeTone="orange" />
            <FilterGroup locale={locale} label="Setup" filterKey="setup" values={options.setups} filters={filters} onChange={onChange} activeTone="orange" />
            <FilterGroup locale={locale} label={text('Konzept', 'Concept')} filterKey="concept" values={options.concepts} filters={filters} onChange={onChange} activeTone="orange" />
            <FilterGroup locale={locale} label="Session" filterKey="session" values={options.sessions} filters={filters} onChange={onChange} activeTone="emerald" />
            <FilterGroup locale={locale} label={text('Qualität', 'Quality')} filterKey="quality" values={options.qualities} filters={filters} onChange={onChange} activeTone="emerald" />
          </div>
        </div>

        <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Weitere Filter', 'More filters')}</p>
          </div>
          <FilterGroup locale={locale} label="Emotion" filterKey="emotion" values={options.emotions} filters={filters} onChange={onChange} activeTone="red" compact />
        </div>
      </div>
    </section>
  )
}
