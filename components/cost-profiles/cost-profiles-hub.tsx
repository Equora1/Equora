'use client'

import { useEffect, useMemo, useState, useTransition, type ChangeEvent } from 'react'
import Link from 'next/link'
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
  formatCurrency,
  normalizeInstrumentType,
  normalizeTradeBrokerProfile,
  normalizeTradeCostProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradeExecutionType,
  normalizeTradeFundingDirection,
  parseTradingNumber,
} from '@/lib/utils/calculations'
import {
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

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function getAccountTemplateLabel(value: TradeAccountTemplate | null) {
  if (!value || value === 'manual') return 'Kein Account-Default'
  return accountTemplateOptions.find((option) => option.value === value)?.label ?? 'Kein Account-Default'
}

function getMarketTemplateLabel(value: TradeMarketTemplate | null) {
  if (!value || value === 'manual') return 'Kein Markt-Default'
  return marketTemplateOptions.find((option) => option.value === value)?.label ?? 'Kein Markt-Default'
}

function getBrokerLabel(value: TradeBrokerProfile) {
  return brokerProfileOptions.find((option) => option.value === value)?.label ?? 'Manuell'
}

function getInstrumentLabel(value: TradeInstrumentType) {
  return instrumentOptions.find((option) => option.value === value)?.label ?? 'Unbekannt'
}

function getCostProfileLabel(value: TradeCostProfile) {
  return costProfileOptions.find((option) => option.value === value)?.label ?? 'Eigenes Profil'
}

function getFundingDirectionLabel(value: TradeFundingDirection) {
  return fundingDirectionOptions.find((option) => option.value === value)?.label ?? 'Manuell'
}

function getCryptoModeLabel(value: TradeCryptoMarketType) {
  return cryptoMarketTypeOptions.find((option) => option.value === value)?.label ?? 'Manuell'
}

function getExecutionLabel(value: TradeExecutionType) {
  return executionTypeOptions.find((option) => option.value === value)?.label ?? 'Manuell'
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
      // ignore malformed local storage payloads
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
        getBrokerLabel(profile.brokerProfile),
        getInstrumentLabel(profile.instrumentType),
        getCostProfileLabel(profile.costProfile),
        getAccountTemplateLabel(profile.defaultAccountTemplate),
        getMarketTemplateLabel(profile.defaultMarketTemplate),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [profiles, search])

  useEffect(() => {
    if (!filteredProfiles.length) {
      setSelectedId(null)
      setDraft({ ...emptyFormState })
      return
    }
    if (!selectedId || !filteredProfiles.some((profile) => profile.id === selectedId)) {
      setSelectedId(filteredProfiles[0].id)
      setDraft(buildFormState(filteredProfiles[0]))
    }
  }, [filteredProfiles, selectedId])

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
    setStatus('Neues Kostenprofil vorbereitet.')
  }

  function updateDraft<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function handleSave() {
    const payload = buildInputFromForm(draft)
    if (!payload.title) {
      setStatus('Bitte einen Namen für das Kostenprofil vergeben.')
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
        setStatus(`Kostenprofil „${mockProfile.title}“ lokal gespeichert.`)
        return
      }

      startTransition(async () => {
        const result = await persistSaveUserCostProfile(payload)
        setStatus(result.message)
        if (!result.success || !result.profile) return
        setProfiles((current) => mergeProfiles(enforceTemplateDefaultUniqueness(result.profile!, [result.profile!, ...current])))
        setSelectedId(result.profile.id)
        setDraft(buildFormState(result.profile))
      })
      return
    }

    if (source === 'mock') {
      const nextProfiles = profiles.map((profile) =>
        profile.id === selectedProfile.id
          ? {
              ...profile,
              ...buildInputFromForm(draft),
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
      setStatus(`Kostenprofil „${payload.title}“ lokal aktualisiert.`)
      return
    }

    startTransition(async () => {
      const result = await persistUpdateUserCostProfile(selectedProfile.id, payload)
      setStatus(result.message)
      if (!result.success || !result.profile) return
      setProfiles((current) => enforceTemplateDefaultUniqueness(result.profile!, current.map((profile) => (profile.id === result.profile!.id ? result.profile! : profile))))
      setDraft(buildFormState(result.profile))
    })
  }

  async function handleDelete() {
    if (!selectedProfile) return

    if (source === 'mock') {
      const nextProfiles = profiles.filter((profile) => profile.id !== selectedProfile.id)
      persistMockProfiles(nextProfiles)
      const fallback = nextProfiles[0] ?? null
      setSelectedId(fallback?.id ?? null)
      setDraft(buildFormState(fallback))
      setStatus('Kostenprofil lokal entfernt.')
      return
    }

    startTransition(async () => {
      const result = await persistDeleteUserCostProfile(selectedProfile.id)
      setStatus(result.message)
      if (!result.success || !result.deletedId) return
      const nextProfiles = profiles.filter((profile) => profile.id !== result.deletedId)
      setProfiles(nextProfiles)
      const fallback = nextProfiles[0] ?? null
      setSelectedId(fallback?.id ?? null)
      setDraft(buildFormState(fallback))
    })
  }

  const totalUsage = selectedProfile ? usageByProfileId[selectedProfile.id] ?? 0 : 0
  const totalBaseFees =
    (parseTradingNumber(draft.fees) ?? 0) +
    (parseTradingNumber(draft.exchangeFees) ?? 0) +
    (parseTradingNumber(draft.fundingFees) ?? 0) +
    (parseTradingNumber(draft.spreadCost) ?? 0) +
    (parseTradingNumber(draft.slippage) ?? 0)

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-orange-400/15 bg-white/5 p-6 shadow-2xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/40">User Cost Profiles</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-orange-300">Eigene Kostenprofile</h1>
            <p className="mt-3 max-w-3xl text-sm text-white/60">
              Verwalte wiederverwendbare Gebühren-, Funding- und Slippage-Setups pro Markt, Broker und Instrument.
              Ideal für wiederkehrende Krypto-Perps, Futures-Rigs oder Aktien-Accounts.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Aktive Profile</p>
            <p className="mt-2 text-3xl font-semibold text-white">{profiles.length}</p>
            <p className="mt-2 text-xs text-white/45">{source === 'supabase' ? 'mit Supabase verknüpft' : 'lokal im Demo-Modus geführt'}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-[28px] border border-white/8 bg-white/5 p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Profile suchen…"
              className="flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
            />
            <button
              type="button"
              onClick={startNewProfile}
              className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 transition hover:border-emerald-300/40"
            >
              Neu
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
                    className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                      active
                        ? 'border-orange-400/35 bg-orange-400/10 shadow-[0_0_30px_rgba(249,115,22,0.12)]'
                        : 'border-white/8 bg-black/20 hover:border-white/16 hover:bg-black/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white">{profile.title}</p>
                        <p className="mt-1 text-xs text-white/45">
                          {getBrokerLabel(profile.brokerProfile)} · {getInstrumentLabel(profile.instrumentType)}
                        </p>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60">
                        {usageCount} Trades
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/55">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{getCostProfileLabel(profile.costProfile)}</span>
                      {profile.accountCurrency ? <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{profile.accountCurrency}</span> : null}
                      {profile.defaultAccountTemplate ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">Account · {getAccountTemplateLabel(profile.defaultAccountTemplate)}</span> : null}
                      {profile.defaultMarketTemplate ? <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">Markt · {getMarketTemplateLabel(profile.defaultMarketTemplate)}</span> : null}
                      {profile.instrumentType === 'crypto' && profile.quoteAsset ? (
                        <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2.5 py-1 text-orange-100">
                          {getCryptoModeLabel(profile.cryptoMarketType)} · {profile.quoteAsset}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-[11px] text-white/30">erstellt {formatDateLabel(profile.createdAt)}</p>
                  </button>
                )
              })
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 px-4 py-12 text-center text-sm text-white/45">
                Noch keine Kostenprofile gefunden.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6 rounded-[28px] border border-white/8 bg-white/5 p-5 shadow-2xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/35">Profile Editor</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {selectedProfile ? selectedProfile.title : 'Neues Kostenprofil'}
              </h2>
              <p className="mt-2 text-sm text-white/55">
                {selectedProfile
                  ? 'Ändere Kosten, Funding-Logik und Instrument-Kontext zentral für alle wiederkehrenden Trades.'
                  : 'Lege ein neues Kostenprofil an, das du später direkt im Trade-Capture wiederverwenden kannst.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startTransition(() => { void handleSave() })}
                className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 transition hover:border-emerald-300/40"
              >
                {selectedProfile ? 'Profil aktualisieren' : 'Profil speichern'}
              </button>
              <button
                type="button"
                disabled={!selectedProfile}
                onClick={() => startTransition(() => { void handleDelete() })}
                className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200 transition hover:border-red-300/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Löschen
              </button>
              <Link
                href="/trades"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
              >
                Zu Trades
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Profilname</span>
              <input
                value={draft.title}
                onChange={(event) => updateDraft('title', event.target.value)}
                placeholder="z. B. Bybit BTC Perps"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Default für Account-Template</span>
              <select
                value={draft.defaultAccountTemplate}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('defaultAccountTemplate', event.target.value as TradeAccountTemplate)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                {accountTemplateOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Default für Markt-Template</span>
              <select
                value={draft.defaultMarketTemplate}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('defaultMarketTemplate', event.target.value as TradeMarketTemplate)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                {marketTemplateOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Brokerprofil</span>
              <select
                value={draft.brokerProfile}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('brokerProfile', normalizeTradeBrokerProfile(event.target.value))}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                {brokerProfileOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Instrumenttyp</span>
              <select
                value={draft.instrumentType}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('instrumentType', normalizeInstrumentType(event.target.value))}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                {instrumentOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Kostenprofil</span>
              <select
                value={draft.costProfile}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('costProfile', normalizeTradeCostProfile(event.target.value))}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                {costProfileOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Kontowährung</span>
              <select
                value={draft.accountCurrency}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('accountCurrency', event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="">Keine Vorgabe</option>
                {currencyOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Punkt-/Pip-Wert</span>
              <input
                value={draft.pointValue}
                onChange={(event) => updateDraft('pointValue', event.target.value)}
                placeholder="z. B. 5"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
              />
            </label>
          </div>

          {draft.instrumentType === 'crypto' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">Krypto-Modus</span>
                <select
                  value={draft.cryptoMarketType}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('cryptoMarketType', normalizeTradeCryptoMarketType(event.target.value))}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                >
                  {cryptoMarketTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">Ausführung</span>
                <select
                  value={draft.executionType}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('executionType', normalizeTradeExecutionType(event.target.value))}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                >
                  {executionTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">Funding-Richtung</span>
                <select
                  value={draft.fundingDirection}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => updateDraft('fundingDirection', normalizeTradeFundingDirection(event.target.value))}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                >
                  {fundingDirectionOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
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
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">Hebel</span>
                <input
                  value={draft.leverage}
                  onChange={(event) => updateDraft('leverage', event.target.value)}
                  placeholder="z. B. 5"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">Funding Rate (Bps)</span>
                <input
                  value={draft.fundingRateBps}
                  onChange={(event) => updateDraft('fundingRateBps', event.target.value)}
                  placeholder="z. B. 1.5"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/40">Funding Intervalle</span>
                <input
                  value={draft.fundingIntervals}
                  onChange={(event) => updateDraft('fundingIntervals', event.target.value)}
                  placeholder="z. B. 3"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
              </label>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Kommission</span>
              <input value={draft.fees} onChange={(event) => updateDraft('fees', event.target.value)} placeholder="0.75" className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Börse</span>
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
              <p className="text-xs uppercase tracking-[0.22em] text-orange-200/70">Profil-Kompass</p>
              <Row label="Broker" value={getBrokerLabel(draft.brokerProfile)} />
              <Row label="Instrument" value={getInstrumentLabel(draft.instrumentType)} />
              <Row label="Kostenprofil" value={getCostProfileLabel(draft.costProfile)} />
              <Row label="Basis-Kosten" value={formatCurrency(totalBaseFees)} />
              <Row label="Verwendet in Trades" value={String(totalUsage)} />
              {draft.instrumentType === 'crypto' ? (
                <>
                  <Row label="Krypto-Modus" value={getCryptoModeLabel(draft.cryptoMarketType)} />
                  <Row label="Execution" value={getExecutionLabel(draft.executionType)} />
                  <Row label="Funding" value={getFundingDirectionLabel(draft.fundingDirection)} />
                </>
              ) : null}
            </div>

            <div className="space-y-3 rounded-3xl border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-white/35">Wofür dieses Profil taugt</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/8 bg-black/30 p-4 text-sm text-white/65">
                  <p className="font-medium text-white">Wiederkehrende Broker-Setups</p>
                  <p className="mt-2">Lege einmal Binance Spot, MEXC Spot, Bybit oder Futures-Kosten an und ziehe sie später direkt in neue Trades.</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/30 p-4 text-sm text-white/65">
                  <p className="font-medium text-white">Krypto mit eigenem Kostenapparat</p>
                  <p className="mt-2">Maker/Taker, Funding, Quote Asset und Hebel bleiben zentral zusammen, statt bei jedem Trade neu zusammengeklaubt zu werden.</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/30 p-4 text-sm text-white/65">
                  <p className="font-medium text-white">Schneller Trade-Capture</p>
                  <p className="mt-2">Im Trade-Form wählst du später nur das Profil aus und sparst dir das Gebühren-Trommeln pro Entry.</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/30 p-4 text-sm text-white/65">
                  <p className="font-medium text-white">Sauberere P&amp;L-Basis</p>
                  <p className="mt-2">Je konsistenter die Kostenprofile, desto glaubwürdiger wird später auch die automatische P&amp;L-Engine.</p>
                </div>
              </div>
            </div>
          </div>

          {status ? (
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              {status}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
