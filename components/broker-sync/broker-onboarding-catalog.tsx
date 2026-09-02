'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AppIcon } from '@/components/ui/app-icon'
import {
  brokerFileImportCapability,
  getBrokerFileImportPreviewHref,
} from '@/lib/utils/broker-file-import-capability'
import {
  brokerCatalogSummary,
  brokerPlatformFamilies,
  findBrokerCatalogEntries,
  getBrokerPlatformFamily,
  type BrokerCatalogEntry,
  type BrokerConnectorAvailability,
  type BrokerConnectorKind,
} from '@/lib/utils/broker-catalog'

type CatalogFilter = 'all' | 'file_upload' | 'controlled_candidate'

const catalogFilters: readonly Readonly<{
  key: CatalogFilter
  label: string
}>[] = Object.freeze([
  Object.freeze({ key: 'all', label: 'Alle Wege' }),
  Object.freeze({ key: 'file_upload', label: 'Dateiprofil gebaut' }),
  Object.freeze({ key: 'controlled_candidate', label: 'API-Kandidat' }),
])

const plannedPlatformFamilies = Object.freeze(
  brokerPlatformFamilies.filter((family) => family.availability === 'planned'),
)

function matchesFilter(broker: BrokerCatalogEntry, filter: CatalogFilter) {
  if (filter === 'all') return true
  if (filter === 'file_upload') {
    return broker.methods.some(
      (method) =>
        method.connectorKind === 'file_upload'
        && method.availability !== 'planned'
        && method.profileKeys.length > 0,
    )
  }
  return broker.methods.some(
    (method) => method.connectorKind === 'direct_api' && method.availability === 'controlled_candidate',
  )
}

export function BrokerOnboardingCatalog() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CatalogFilter>('all')
  const matchingBrokers = useMemo(
    () => findBrokerCatalogEntries(query).filter((broker) => matchesFilter(broker, filter)),
    [filter, query],
  )
  return (
    <section className="overflow-hidden rounded-[1.7rem] border border-white/8 bg-[#090a0d]">
      <div className="border-b border-white/8 px-5 py-6 sm:px-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="eq-display text-[0.58rem] text-[#b09a7a]">Brokerkatalog</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Ein Katalog, wenige technische Familien</h3>
            <p className="mt-3 text-sm leading-6 text-white/58">
              Brokername, Plattformfamilie und Importprofil sind getrennt. So kann eine gemeinsame Plattform später
              mehrere Broker abdecken. Die Parserprofile sind gebaut. {brokerFileImportCapability.blockedReason}
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-[24rem] sm:grid-cols-4 xl:flex-none">
            <CatalogMetric value={brokerCatalogSummary.brokerCount} label="Broker" />
            <CatalogMetric value={brokerCatalogSummary.platformCount} label="Plattform" />
            <CatalogMetric value={brokerCatalogSummary.builtFileProfileCount} label="Parserprofile" />
            <CatalogMetric value={brokerCatalogSummary.plannedSharedFamilyCount} label="Familien geplant" />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="block w-full lg:max-w-md">
            <span className="sr-only">Broker oder Plattform suchen</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Broker oder Plattform suchen"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#c8823a]/50 focus:ring-2 focus:ring-[#c8823a]/15"
            />
          </label>
          <div className="flex flex-wrap gap-2" aria-label="Brokerkatalog filtern">
            {catalogFilters.map((item) => {
              const active = item.key === filter
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  aria-pressed={active}
                  className={active
                    ? 'rounded-full border border-[#c8823a]/40 bg-[#c8823a]/12 px-3.5 py-2 text-xs font-medium text-[#f0a855]'
                    : 'rounded-full border border-white/9 bg-white/[0.025] px-3.5 py-2 text-xs text-white/55 transition hover:border-white/16 hover:text-white/80'}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-7">
        <p className="mb-4 text-xs text-white/45" aria-live="polite" aria-atomic="true">
          {matchingBrokers.length} passende {matchingBrokers.length === 1 ? 'Option' : 'Optionen'}
        </p>
        {matchingBrokers.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {matchingBrokers.map((broker) => (
              <BrokerCatalogCard key={broker.brokerCode} broker={broker} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center">
            <p className="text-sm font-medium text-white">Noch kein eindeutiger Treffer.</p>
            <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-white/55">
              Nutze „Weitere Broker“ mit allgemeinem CSV-Mapping. Das erweitert den Importweg, ohne eine nicht gebaute
              API-Verbindung zu behaupten.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-white/8 bg-white/[0.018] px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-white">Gemeinsame Plattformfamilien als nächster Hebel</p>
            <p className="mt-1 text-xs leading-5 text-white/50">
              Reine Roadmap – derzeit keine aktive Verbindung und kein Unterstützungsversprechen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {plannedPlatformFamilies.map((family) => (
              <span
                key={family.familyKey}
                className="rounded-full border border-white/9 bg-black/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-white/42"
              >
                {family.label} · geplant
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function CatalogMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-3 text-center">
      <p className="text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 flex min-h-7 items-center justify-center text-[11px] leading-4 uppercase tracking-[0.1em] text-white/60">
        {label}
      </p>
    </div>
  )
}

function BrokerCatalogCard({ broker }: { broker: BrokerCatalogEntry }) {
  const family = getBrokerPlatformFamily(broker.platformFamilyKey)
  const fileMethod = broker.methods.find(
    (method) =>
      method.connectorKind === 'file_upload'
      && method.availability !== 'planned'
      && method.profileKeys.length > 0,
  )
  const availableFileMethod = fileMethod?.availability === 'available' ? fileMethod : null
  const directApiCandidate = broker.methods.some(
    (method) => method.connectorKind === 'direct_api' && method.availability === 'controlled_candidate',
  )
  const importHref = getBrokerFileImportPreviewHref(
    availableFileMethod?.profileKeys.length === 1
      ? availableFileMethod.profileKeys[0]
      : null,
  )

  return (
    <article className="flex min-h-64 flex-col rounded-2xl border border-white/8 bg-white/[0.022] p-4 transition hover:border-[#c8823a]/22 hover:bg-white/[0.032]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-white">{broker.displayName}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.13em] text-[#b09a7a]">
            {family?.label ?? 'Unbekannte Plattform'}
          </p>
        </div>
        <span className="rounded-xl border border-white/8 bg-black/20 p-2 text-white/50">
          <AppIcon name={broker.entryKind === 'fallback' ? 'scan' : 'vault'} className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {broker.methods.map((method) => (
          <MethodBadge
            key={`${method.connectorKind}-${method.availability}`}
            connectorKind={method.connectorKind}
            availability={method.availability}
          />
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-white/52">{broker.supportNote}</p>
      <p className="mt-3 text-xs leading-5 text-white/60">{broker.markets.join(' · ')}</p>

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {availableFileMethod ? (
          <Link
            href={importHref}
            className="inline-flex items-center gap-2 rounded-full border border-[#c8823a]/30 bg-[#c8823a]/10 px-3.5 py-2 text-xs font-medium text-[#f0a855] transition hover:border-[#c8823a]/50 hover:bg-[#c8823a]/15"
          >
            {brokerFileImportCapability.persistenceActionLabel}
            <AppIcon name="arrow" className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : fileMethod ? (
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed rounded-full border border-[#c8823a]/18 bg-[#c8823a]/6 px-3.5 py-2 text-xs text-[#d3a46d]/70"
          >
            {brokerFileImportCapability.blockedActionLabel}
          </span>
        ) : null}
        {directApiCandidate ? (
          <a
            href="#broker-connections"
            className="inline-flex rounded-full border border-white/9 bg-white/[0.025] px-3.5 py-2 text-xs text-white/55 transition hover:border-white/16 hover:text-white/80"
          >
            Kandidat prüfen
          </a>
        ) : null}
      </div>
    </article>
  )
}

function MethodBadge({
  connectorKind,
  availability,
}: {
  connectorKind: BrokerConnectorKind
  availability: BrokerConnectorAvailability
}) {
  const label = connectorKind === 'file_upload' && availability === 'available'
    ? 'Dateiimport verfügbar'
    : connectorKind === 'file_upload' && availability === 'controlled_candidate'
      ? 'Dateiprofil gebaut'
    : connectorKind === 'direct_api' && availability === 'controlled_candidate'
      ? 'API-Kandidat'
      : availability === 'planned'
        ? 'Geplant'
        : 'Plattform-Sync'
  const className = availability === 'available'
    ? 'border-emerald-300/20 bg-emerald-300/8 text-emerald-200'
    : availability === 'controlled_candidate'
      ? 'border-[#c8823a]/22 bg-[#c8823a]/8 text-[#e6b376]'
      : 'border-white/10 bg-white/[0.03] text-white/60'

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] ${className}`}>
      {label}
    </span>
  )
}
