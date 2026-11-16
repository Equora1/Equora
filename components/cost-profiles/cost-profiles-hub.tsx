'use client'

import { useEffect, useMemo, useState, useTransition, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalNumberLocale, journalText, type JournalLocale } from '@/lib/i18n/journal'
import { DEFAULT_TRADE_TIMEZONE } from '@/lib/utils/trade-time'
import {
  deleteUserCostProfile as persistDeleteUserCostProfile,
  saveUserCostProfile as persistSaveUserCostProfile,
  updateUserCostProfile as persistUpdateUserCostProfile,
} from '@/app/actions/user-cost-profiles'
import type { SavedUserCostProfile, SaveUserCostProfileInput } from '@/lib/types/user-cost-profile'
import type {
  TradeAccountTemplate,
  TradeBrokerProfile,
  TradeCostProfile,
  TradeCryptoMarketType,
  TradeExecutionType,
  TradeFundingDirection,
  TradeInstrumentType,
  TradeMarketTemplate,
} from '@/lib/types/trade'
import {
  formatPlainNumber,
  normalizeInstrumentType,
  normalizeTradeBrokerProfile,
  normalizeTradeCostProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradeExecutionType,
  normalizeTradeFundingDirection,
  parseTradingNumber,
} from '@/lib/utils/calculations'
import {
  getAccountTemplateLabel,
  getMarketTemplateLabel,
  getBrokerProfileLabel,
  getInstrumentLabel,
  getCostProfileLabel,
  getFundingDirectionLabel,
  getCryptoMarketTypeLabel,
  getExecutionTypeLabel,
  accountTemplateOptions,
  brokerProfileOptions,
  costProfileOptions,
  cryptoMarketTypeOptions,
  executionTypeOptions,
  fundingDirectionOptions,
  instrumentOptions,
  marketTemplateOptions,
} from '@/lib/utils/trade-presets'

const USER_COST_PROFILE_STORAGE_KEY = 'equora-user-cost-profiles'

const currencyOptions = ['EUR', 'USD', 'USDT', 'USDC', 'GBP']

type CostProfilesHubProps = {
  initialProfiles: SavedUserCostProfile[]
  usageByProfileId: Record<string, number>
  source: 'supabase' | 'mock'
}

type ProfileFormState = {
  title: string
  defaultAccountTemplate: TradeAccountTemplate
  defaultMarketTemplate: TradeMarketTemplate
  brokerProfile: TradeBrokerProfile
  instrumentType: TradeInstrumentType
  costProfile: TradeCostProfile
  accountCurrency: string
  cryptoMarketType: TradeCryptoMarketType
  executionType: TradeExecutionType
  fundingDirection: TradeFundingDirection
  quoteAsset: string
  leverage: string
  pointValue: string
  fees: string
  exchangeFees: string
  fundingFees: string
  fundingRateBps: string
  fundingIntervals: string
  spreadCost: string
  slippage: string
}

const emptyFormState: ProfileFormState = {
  title: '',
  defaultAccountTemplate: 'manual',
  defaultMarketTemplate: 'manual',
  brokerProfile: 'manual',
  instrumentType: 'stocks',
  costProfile: 'user-custom',
  accountCurrency: 'EUR',
  cryptoMarketType: 'manual',
  executionType: 'manual',
  fundingDirection: 'manual',
  quoteAsset: 'USDT',
  leverage: '',
  pointValue: '',
  fees: '',
  exchangeFees: '',
  fundingFees: '',
  fundingRateBps: '',
  fundingIntervals: '',
  spreadCost: '',
  slippage: '',
}

function numberToField(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(value) ? '' : String(value)
}

function buildFormState(profile?: SavedUserCostProfile | null): ProfileFormState {
  if (!profile) return { ...emptyFormState }

  return {
    title: profile.title,
    defaultAccountTemplate: profile.defaultAccountTemplate ?? 'manual',
    defaultMarketTemplate: profile.defaultMarketTemplate ?? 'manual',
    brokerProfile: profile.brokerProfile,
    instrumentType: profile.instrumentType,
    costProfile: profile.costProfile,
    accountCurrency: profile.accountCurrency ?? '',
    cryptoMarketType: profile.cryptoMarketType,
    executionType: profile.executionType,
    fundingDirection: profile.fundingDirection,
    quoteAsset: profile.quoteAsset ?? '',
    leverage: numberToField(profile.leverage),
    pointValue: numberToField(profile.pointValue),
    fees: numberToField(profile.fees),
    exchangeFees: numberToField(profile.exchangeFees),
    fundingFees: numberToField(profile.fundingFees),
    fundingRateBps: numberToField(profile.fundingRateBps),
    fundingIntervals: numberToField(profile.fundingIntervals),
    spreadCost: numberToField(profile.spreadCost),
    slippage: numberToField(profile.slippage),
  }
}

function buildInputFromForm(form: ProfileFormState): SaveUserCostProfileInput {
  return {
    title: form.title.trim(),
    defaultAccountTemplate: form.defaultAccountTemplate === 'manual' ? null : form.defaultAccountTemplate,
    defaultMarketTemplate: form.defaultMarketTemplate === 'manual' ? null : form.defaultMarketTemplate,
    brokerProfile: normalizeTradeBrokerProfile(form.brokerProfile),
    instrumentType: normalizeInstrumentType(form.instrumentType),
    costProfile: normalizeTradeCostProfile(form.costProfile),
    accountCurrency: form.accountCurrency.trim() || null,
    cryptoMarketType: normalizeTradeCryptoMarketType(form.cryptoMarketType),
    executionType: normalizeTradeExecutionType(form.executionType),
    fundingDirection: normalizeTradeFundingDirection(form.fundingDirection),
    quoteAsset: form.quoteAsset.trim().toUpperCase() || null,
    leverage: parseTradingNumber(form.leverage),
    pointValue: parseTradingNumber(form.pointValue),
    fees: parseTradingNumber(form.fees),
    exchangeFees: parseTradingNumber(form.exchangeFees),
    fundingFees: parseTradingNumber(form.fundingFees),
    fundingRateBps: parseTradingNumber(form.fundingRateBps),
    fundingIntervals: parseTradingNumber(form.fundingIntervals),
    spreadCost: parseTradingNumber(form.spreadCost),
    slippage: parseTradingNumber(form.slippage),
  }
}

function mergeProfiles(...groups: SavedUserCostProfile[][]) {
  const merged = new Map<string, SavedUserCostProfile>()
  groups.flat().forEach((profile) => merged.set(profile.id, profile))
  return Array.from(merged.values()).sort((left, right) =>
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )
}

function formatDateLabel(value: string, locale: JournalLocale) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat(journalNumberLocale[locale], {
    dateStyle: 'medium', timeStyle: 'short', timeZone: DEFAULT_TRADE_TIMEZONE,
  }).format(date)
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/6 bg-black/20 px-4 py-3 text-sm">
      <span className="text-white/45">{label}</span>
      <span className="text-right text-white/80">{value}</span>
    </div>
  )
}

export function CostProfilesHub({ initialProfiles, usageByProfileId, source }: CostProfilesHubProps) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const [profiles, setProfiles] = useState<SavedUserCostProfile[]>(initialProfiles)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initialProfiles[0]?.id ?? null)
  const [draft, setDraft] = useState<ProfileFormState>(buildFormState(initialProfiles[0]))
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setProfiles((current) => (source === 'mock' ? mergeProfiles(current, initialProfiles) : initialProfiles))
  }, [initialProfiles, source])

  useEffect(() => {
    if (source !== 'mock' || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(USER_COST_PROFILE_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as SavedUserCostProfile[]
      if (!Array.isArray(parsed)) return
      setProfiles((current) => mergeProfiles(current, parsed))
    } catch {
      // Ignore malformed local storage payloads
    }
  }, [source])

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return profiles
    return profiles.filter((profile) =>
      [
        profile.title,
        profile.accountCurrency ?? '',
        profile.quoteAsset ?? '',
        getBrokerProfileLabel(profile.brokerProfile, locale),
        profile.brokerProfile ?? '',
        getInstrumentLabel(profile.instrumentType, locale),
        profile.instrumentType ?? '',
        getCostProfileLabel(profile.costProfile, locale),
        profile.costProfile ?? '',
        getAccountTemplateLabel(profile.defaultAccountTemplate, locale),
        profile.defaultAccountTemplate ?? '',
        getMarketTemplateLabel(profile.defaultMarketTemplate, locale),
        profile.defaultMarketTemplate ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [profiles, search, locale])

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  )

  function persistMockProfiles(nextProfiles: SavedUserCostProfile[]) {
    const merged = mergeProfiles(nextProfiles)
    setProfiles(merged)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        USER_COST_PROFILE_STORAGE_KEY,
        JSON.stringify(merged.filter((profile) => profile.source === 'mock')),
      )
    }
  }

  function enforceTemplateDefaultUniqueness(nextProfile: SavedUserCostProfile, collection: SavedUserCostProfile[]) {
    return collection.map((profile) => {
      if (profile.id === nextProfile.id) return nextProfile

      const accountConflict =
        nextProfile.defaultAccountTemplate &&
        profile.defaultAccountTemplate === nextProfile.defaultAccountTemplate
      const marketConflict =
        nextProfile.defaultMarketTemplate &&
        profile.defaultMarketTemplate === nextProfile.defaultMarketTemplate

      if (!accountConflict && !marketConflict) return profile

      return {
        ...profile,
        defaultAccountTemplate: accountConflict ? null : profile.defaultAccountTemplate,
        defaultMarketTemplate: marketConflict ? null : profile.defaultMarketTemplate,
      }
    })
  }

  function openProfile(profile: SavedUserCostProfile) {
    setSelectedId(profile.id)
    setDraft(buildFormState(profile))
    setStatus('')
  }

  function startNewProfile() {
    setSelectedId(null)
    setDraft({ ...emptyFormState })
    setStatus(text('Neues Kostenprofil vorbereitet.', 'New cost profile ready to edit.'))
  }

  function updateDraft<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function handleSave() {
    const payload = buildInputFromForm(draft)
    if (!payload.title) {
      setStatus(text('Bitte einen Namen für das Kostenprofil vergeben.', 'Enter a name for the cost profile.'))
      return
    }

    if (selectedId !== null && !selectedProfile) {
      setStatus(text('Dieses Profil ist nicht mehr verfügbar. Wähle ein Profil oder lege ein neues an.', 'This profile is no longer available. Select a profile or create a new one.'))
      return
    }

    if (!selectedProfile) {
      if (source === 'mock') {
        const mockProfile: SavedUserCostProfile = {
          id: crypto.randomUUID(),
          title: payload.title,
          defaultAccountTemplate: payload.defaultAccountTemplate ?? null,
          defaultMarketTemplate: payload.defaultMarketTemplate ?? null,
          brokerProfile: payload.brokerProfile,
          instrumentType: payload.instrumentType,
          costProfile: 'user-custom',
          accountCurrency: payload.accountCurrency ?? null,
          cryptoMarketType: payload.cryptoMarketType ?? 'manual',
          executionType: payload.executionType ?? 'manual',
          fundingDirection: payload.fundingDirection ?? 'manual',
          quoteAsset: payload.quoteAsset ?? null,
          leverage: payload.leverage ?? null,
          pointValue: payload.pointValue ?? null,
          fees: payload.fees ?? null,
          exchangeFees: payload.exchangeFees ?? null,
          fundingFees: payload.fundingFees ?? null,
          fundingRateBps: payload.fundingRateBps ?? null,
          fundingIntervals: payload.fundingIntervals ?? null,
          spreadCost: payload.spreadCost ?? null,
          slippage: payload.slippage ?? null,
          source: 'mock',
          createdAt: new Date().toISOString(),
        }
        const nextProfiles = enforceTemplateDefaultUniqueness(mockProfile, [mockProfile, ...profiles])
        persistMockProfiles(nextProfiles)
        setSelectedId(mockProfile.id)
        setDraft(buildFormState(mockProfile))
        setStatus(text(`Kostenprofil „${mockProfile.title}“ lokal gespeichert.`, `Cost profile “${mockProfile.title}” saved in this browser.`))
        return
      }

      const result = await persistSaveUserCostProfile(payload, locale)
      setStatus(result.message)
      if (!result.success || !result.profile) return
      setProfiles((current) => mergeProfiles(enforceTemplateDefaultUniqueness(result.profile!, [result.profile!, ...current])))
      setSelectedId(result.profile.id)
      setDraft(buildFormState(result.profile))
      return
    }

    if (source === 'mock') {
      const nextProfiles = profiles.map((profile) =>
        profile.id === selectedProfile.id
          ? {
              ...profile,
              ...payload,
              defaultAccountTemplate: payload.defaultAccountTemplate ?? null,
              defaultMarketTemplate: payload.defaultMarketTemplate ?? null,
              costProfile: 'user-custom',
              accountCurrency: payload.accountCurrency ?? null,
              cryptoMarketType: payload.cryptoMarketType ?? 'manual',
              executionType: payload.executionType ?? 'manual',
              fundingDirection: payload.fundingDirection ?? 'manual',
              quoteAsset: payload.quoteAsset ?? null,
            }
          : profile,
      ) as SavedUserCostProfile[]
      const updatedProfile = nextProfiles.find((profile) => profile.id === selectedProfile.id) ?? selectedProfile
      persistMockProfiles(enforceTemplateDefaultUniqueness(updatedProfile, nextProfiles))
      setStatus(text(`Kostenprofil „${payload.title}“ lokal aktualisiert.`, `Cost profile “${payload.title}” updated in this browser.`))
      return
    }

    const result = await persistUpdateUserCostProfile(selectedProfile.id, payload, locale)
    setStatus(result.message)
    if (!result.success || !result.profile) return
    const updated = result.profile
    setProfiles((current) => enforceTemplateDefaultUniqueness(updated, current.map((profile) => profile.id === updated.id ? updated : profile)))
    setDraft(buildFormState(updated))
  }

  async function handleDelete() {
    if (!selectedProfile) return

    if (source === 'mock') {
      const nextProfiles = profiles.filter((profile) => profile.id !== selectedProfile.id)
      persistMockProfiles(nextProfiles)
      const fallback = nextProfiles[0] ?? null
      setSelectedId(fallback?.id ?? null)
      setDraft(buildFormState(fallback))
      setStatus(text('Kostenprofil lokal entfernt.', 'Local cost profile removed.'))
      return
    }

    const result = await persistDeleteUserCostProfile(selectedProfile.id, locale)
    setStatus(result.message)
    if (!result.success || !result.deletedId) return
    const nextProfiles = profiles.filter((profile) => profile.id !== result.deletedId)
    setProfiles(nextProfiles)
    const fallback = nextProfiles[0] ?? null
    setSelectedId(fallback?.id ?? null)
    setDraft(buildFormState(fallback))
  }

  const totalUsage = selectedProfile ? usageByProfileId[selectedProfile.id] ?? 0 : 0
  const totalBaseFees =
    (parseTradingNumber(draft.fees) ?? 0) +
    (parseTradingNumber(draft.exchangeFees) ?? 0) +
    (parseTradingNumber(draft.fundingFees) ?? 0) +
    (parseTradingNumber(draft.spreadCost) ?? 0) +
    (parseTradingNumber(draft.slippage) ?? 0)

  const baseFeesLabel = formatPlainNumber(totalBaseFees, 2, locale)

  return (
    <div lang={locale} className="space-y-6">
      <section className="rounded-[28px] border border-orange-400/15 bg-white/5 p-6 shadow-2xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/40">{text('Gebühren und Kosten', 'Fees and costs')}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-orange-300">{text('Eigene Kostenprofile', 'Your cost profiles')}</h1>
            <p className="mt-3 max-w-3xl text-sm text-white/60">
              {text('Speichere wiederkehrende Gebühren als Vorgabe für neue Trades. Die tatsächlichen Kosten stehen in deiner Brokerabrechnung.', 'Save recurring fees as defaults for new trades. Check your broker statement for actual costs.')}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">{text('Aktive Profile', 'Profiles')}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{profiles.length}</p>
            <p className="mt-2 text-xs text-white/45">{source === 'supabase' ? text('in deinem Konto gespeichert', 'saved to your account') : text('lokal in diesem Browser gespeichert (Demo)', 'saved in this browser in demo mode')}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="min-w-0 rounded-[28px] border border-white/8 bg-white/5 p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={text('Profile suchen', 'Search profiles')}
              placeholder={text('Profile suchen…', 'Search profiles…')}
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
            />
            <button
              type="button"
              onClick={startNewProfile}
              disabled={isPending}
              className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 transition hover:border-emerald-300/40"
            >
              {text('Neu', 'New profile')}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {filteredProfiles.length ? (
              filteredProfiles.map((profile) => {
                const active = profile.id === selectedId
                const usageCount = usageByProfileId[profile.id] ?? 0
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => openProfile(profile)}
                    disabled={isPending}
                    aria-pressed={active}
                    className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                      active
                        ? 'border-orange-400/35 bg-orange-400/10 shadow-[0_0_30px_rgba(249,115,22,0.12)]'
                        : 'border-white/8 bg-black/20 hover:border-white/16 hover:bg-black/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-white">{profile.title}</p>
                        <p className="mt-1 text-xs text-white/45">
                          {getBrokerProfileLabel(profile.brokerProfile, locale)} · {getInstrumentLabel(profile.instrumentType, locale)}
                        </p>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60">
                        {usageCount} {usageCount === 1 ? 'Trade' : 'Trades'}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/55">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{getCostProfileLabel(profile.costProfile, locale)}</span>
                      {profile.accountCurrency ? <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{profile.accountCurrency}</span> : null}
                      {profile.defaultAccountTemplate ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">{text('Konto', 'Account')} · {getAccountTemplateLabel(profile.defaultAccountTemplate, locale)}</span> : null}
                      {profile.defaultMarketTemplate ? <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">{text('Markt', 'Market')} · {getMarketTemplateLabel(profile.defaultMarketTemplate, locale)}</span> : null}
                      {profile.instrumentType === 'crypto' && profile.quoteAsset ? (
                        <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2.5 py-1 text-orange-100">
                          {getCryptoMarketTypeLabel(profile.cryptoMarketType, locale)} · {profile.quoteAsset}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-[11px] text-white/30">{text('Erstellt', 'Created')} {formatDateLabel(profile.createdAt, locale)}</p>
                  </button>
                )
              })
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 px-4 py-12 text-center text-sm text-white/45">
                {text('Noch keine Kostenprofile gefunden.', 'No cost profiles found.')}
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 space-y-6 rounded-[28px] border border-white/8 bg-white/5 p-5 shadow-2xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/35">{text('Profile Editor', 'Profile editor')}</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {selectedProfile ? selectedProfile.title : text('Neues Kostenprofil', 'New cost profile')}
              </h2>
              <p className="mt-2 text-sm text-white/55">
                {selectedProfile
                  ? text('Ändere Kosten, Funding-Logik und Instrument-Kontext zentral für alle wiederkehrenden Trades.', 'Edit the fees and defaults that this profile provides when adding a trade.')
                  : text('Lege ein Kostenprofil an, um Gebühren bei der Trade-Erfassung wiederzuverwenden.', 'Create a profile to reuse fees when adding trades.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startTransition(handleSave)}
                disabled={isPending}
                className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 transition hover:border-emerald-300/40"
              >
                {isPending ? text('Bitte warten …', 'Please wait…') : selectedProfile ? text('Profil aktualisieren', 'Update profile') : text('Profil speichern', 'Save profile')}
              </button>
              <button
                type="button"
                disabled={!selectedProfile || isPending}
                onClick={() => startTransition(handleDelete)}
                className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200 transition hover:border-red-300/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {text('Löschen', 'Delete')}
              </button>
              <Link
                href="/trades"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
              >
                {text('Zu Trades', 'View trades')}
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Profilname', 'Profile name')}</span>
              <input
                value={draft.title}
                onChange={(event) => updateDraft('title', event.target.value)}
                placeholder={text('z. B. Bybit BTC Perps', 'e.g. Bybit BTC Perps')}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Default für Account-Template', 'Default for account template')}</span>
              <select
                value={draft.defaultAccountTemplate}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('defaultAccountTemplate', event.target.value as TradeAccountTemplate)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                {accountTemplateOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.value === 'manual' ? text('Keine Vorgabe', 'No default') : getAccountTemplateLabel(option.value, locale)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Default für Markt-Template', 'Default for market template')}</span>
              <select
                value={draft.defaultMarketTemplate}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('defaultMarketTemplate', event.target.value as TradeMarketTemplate)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                {marketTemplateOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.value === 'manual' ? text('Keine Vorgabe', 'No default') : getMarketTemplateLabel(option.value, locale)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Brokerprofil', 'Broker profile')}</span>
              <select
                value={draft.brokerProfile}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('brokerProfile', normalizeTradeBrokerProfile(event.target.value))}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                {brokerProfileOptions.map((option) => (
                  <option key={option.value} value={option.value}>{getBrokerProfileLabel(option.value, locale)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Instrumenttyp', 'Instrument type')}</span>
              <select
                value={draft.instrumentType}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('instrumentType', normalizeInstrumentType(event.target.value))}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                {instrumentOptions.map((option) => (
                  <option key={option.value} value={option.value}>{getInstrumentLabel(option.value, locale)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Kostenprofil', 'Cost preset')}</span>
              <select
                value={draft.costProfile}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('costProfile', normalizeTradeCostProfile(event.target.value))}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                {costProfileOptions.map((option) => (
                  <option key={option.value} value={option.value}>{getCostProfileLabel(option.value, locale)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Kontowährung', 'Account currency')}</span>
              <select
                value={draft.accountCurrency}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('accountCurrency', event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="">{text('Keine Vorgabe', 'No default')}</option>
                {currencyOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Punkt-/Pip-Wert', 'Point or pip value')}</span>
              <input
                value={draft.pointValue}
                onChange={(event) => updateDraft('pointValue', event.target.value)}
                placeholder={text('z. B. 5', 'e.g. 5')}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
              />
            </label>
          </div>

          {draft.instrumentType === 'crypto' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Krypto-Modus', 'Crypto market type')}</span>
                <select
                  value={draft.cryptoMarketType}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('cryptoMarketType', normalizeTradeCryptoMarketType(event.target.value))}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                >
                  {cryptoMarketTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{getCryptoMarketTypeLabel(option.value, locale)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Ausführung', 'Execution')}</span>
                <select
                  value={draft.executionType}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('executionType', normalizeTradeExecutionType(event.target.value))}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                >
                  {executionTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{getExecutionTypeLabel(option.value, locale)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Funding-Richtung', 'Funding direction')}</span>
                <select
                  value={draft.fundingDirection}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('fundingDirection', normalizeTradeFundingDirection(event.target.value))}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                >
                  {fundingDirectionOptions.map((option) => (
                    <option key={option.value} value={option.value}>{getFundingDirectionLabel(option.value, locale)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">Quote Asset</span>
                <input
                  value={draft.quoteAsset}
                  onChange={(event) => updateDraft('quoteAsset', event.target.value.toUpperCase())}
                  placeholder="USDT"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Hebel', 'Leverage')}</span>
                <input
                  value={draft.leverage}
                  onChange={(event) => updateDraft('leverage', event.target.value)}
                  placeholder={text('z. B. 5', 'e.g. 5')}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Funding Rate (Bps)', 'Funding rate (basis points)')}</span>
                <input
                  value={draft.fundingRateBps}
                  onChange={(event) => updateDraft('fundingRateBps', event.target.value)}
                  placeholder={text('z. B. 1.5', 'e.g. 1.5')}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Funding Intervalle', 'Funding intervals')}</span>
                <input
                  value={draft.fundingIntervals}
                  onChange={(event) => updateDraft('fundingIntervals', event.target.value)}
                  placeholder={text('z. B. 3', 'e.g. 3')}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
              </label>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Kommission', 'Commission')}</span>
              <input value={draft.fees} onChange={(event) => updateDraft('fees', event.target.value)} placeholder="0.75" className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">{text('Börse', 'Exchange fees')}</span>
              <input value={draft.exchangeFees} onChange={(event) => updateDraft('exchangeFees', event.target.value)} placeholder="0.15" className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Funding</span>
              <input value={draft.fundingFees} onChange={(event) => updateDraft('fundingFees', event.target.value)} placeholder="0.10" className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Spread</span>
              <input value={draft.spreadCost} onChange={(event) => updateDraft('spreadCost', event.target.value)} placeholder="0.20" className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Slippage</span>
              <input value={draft.slippage} onChange={(event) => updateDraft('slippage', event.target.value)} placeholder="0.05" className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" />
            </label>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
            <div className="space-y-3 rounded-3xl border border-orange-400/12 bg-orange-400/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-orange-200/70">{text('Profil-Kompass', 'Profile summary')}</p>
              <Row label="Broker" value={getBrokerProfileLabel(draft.brokerProfile, locale)} />
              <Row label="Instrument" value={getInstrumentLabel(draft.instrumentType, locale)} />
              <Row label={text('Kostenprofil', 'Cost preset')} value={getCostProfileLabel(draft.costProfile, locale)} />
              <Row label={text('Basis-Kosten', 'Base costs')} value={text(`${baseFeesLabel} · Kontowährung je Trade`, `${baseFeesLabel} · account currency per trade`)} />
              <Row label={text('Verwendet in Trades', 'Trades using this profile')} value={String(totalUsage)} />
              {draft.instrumentType === 'crypto' ? (
                <>
                  <Row label={text('Krypto-Modus', 'Crypto market type')} value={getCryptoMarketTypeLabel(draft.cryptoMarketType, locale)} />
                  <Row label={text('Ausführung', 'Execution')} value={getExecutionTypeLabel(draft.executionType, locale)} />
                  <Row label="Funding" value={getFundingDirectionLabel(draft.fundingDirection, locale)} />
                </>
              ) : null}
            </div>

            <p className="self-start text-sm leading-6 text-white/55">
              {text('Du kannst das Profil beim Erfassen eines Trades auswählen. Konto- und Marktvorgaben füllen die Gebühren für passende neue Trades vor.', 'Select this profile when adding a trade. Account and market defaults prefill fees for matching new trades.')}
            </p>
          </div>

          {status ? (
            <div role="status" className="rounded-2xl border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              {status}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
