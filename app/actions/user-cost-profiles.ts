'use server'

import { revalidatePath } from 'next/cache'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { mapUserCostProfileRow } from '@/lib/server/user-cost-profiles'
import type { UserCostProfileRow } from '@/lib/types/db'
import type { SaveUserCostProfileInput, SavedUserCostProfile, UpdateUserCostProfileInput } from '@/lib/types/user-cost-profile'
import {
  normalizeInstrumentType,
  normalizeTradeAccountTemplate,
  normalizeTradeBrokerProfile,
  normalizeTradeCryptoMarketType,
  normalizeTradeExecutionType,
  normalizeTradeFundingDirection,
  normalizeTradeMarketTemplate,
} from '@/lib/utils/calculations'

function normalizeDefaultAccountTemplate(value?: SaveUserCostProfileInput['defaultAccountTemplate']) {
  const normalized = normalizeTradeAccountTemplate(value)
  return normalized === 'manual' ? null : normalized
}

function normalizeDefaultMarketTemplate(value?: SaveUserCostProfileInput['defaultMarketTemplate']) {
  const normalized = normalizeTradeMarketTemplate(value)
  return normalized === 'manual' ? null : normalized
}

function buildPersistPayload(userId: string, input: SaveUserCostProfileInput) {
  return {
    user_id: userId,
    title: input.title.trim(),
    default_account_template: normalizeDefaultAccountTemplate(input.defaultAccountTemplate),
    default_market_template: normalizeDefaultMarketTemplate(input.defaultMarketTemplate),
    broker_profile: normalizeTradeBrokerProfile(input.brokerProfile),
    instrument_type: normalizeInstrumentType(input.instrumentType),
    cost_profile: 'user-custom',
    account_currency: input.accountCurrency?.trim() || null,
    crypto_market_type: normalizeTradeCryptoMarketType(input.cryptoMarketType),
    execution_type: normalizeTradeExecutionType(input.executionType),
    funding_direction: normalizeTradeFundingDirection(input.fundingDirection),
    quote_asset: input.quoteAsset?.trim().toUpperCase() || null,
    leverage: input.leverage ?? null,
    point_value: input.pointValue ?? null,
    fees: input.fees ?? null,
    exchange_fees: input.exchangeFees ?? null,
    funding_fees: input.fundingFees ?? null,
    funding_rate_bps: input.fundingRateBps ?? null,
    funding_intervals: input.fundingIntervals ?? null,
    spread_cost: input.spreadCost ?? null,
    slippage: input.slippage ?? null,
  }
}

function buildMockProfile(input: SaveUserCostProfileInput): SavedUserCostProfile {
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    defaultAccountTemplate: normalizeDefaultAccountTemplate(input.defaultAccountTemplate),
    defaultMarketTemplate: normalizeDefaultMarketTemplate(input.defaultMarketTemplate),
    brokerProfile: normalizeTradeBrokerProfile(input.brokerProfile),
    instrumentType: normalizeInstrumentType(input.instrumentType),
    costProfile: 'user-custom',
    accountCurrency: input.accountCurrency?.trim() || null,
    cryptoMarketType: normalizeTradeCryptoMarketType(input.cryptoMarketType),
    executionType: normalizeTradeExecutionType(input.executionType),
    fundingDirection: normalizeTradeFundingDirection(input.fundingDirection),
    quoteAsset: input.quoteAsset?.trim().toUpperCase() || null,
    leverage: input.leverage ?? null,
    pointValue: input.pointValue ?? null,
    fees: input.fees ?? null,
    exchangeFees: input.exchangeFees ?? null,
    fundingFees: input.fundingFees ?? null,
    fundingRateBps: input.fundingRateBps ?? null,
    fundingIntervals: input.fundingIntervals ?? null,
    spreadCost: input.spreadCost ?? null,
    slippage: input.slippage ?? null,
    source: 'mock',
    createdAt: new Date().toISOString(),
  }
}

async function clearCompetingTemplateDefaults(
  supabase: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>,
  userId: string,
  profileId: string,
  input: SaveUserCostProfileInput,
) {
  const defaultAccountTemplate = normalizeDefaultAccountTemplate(input.defaultAccountTemplate)
  const defaultMarketTemplate = normalizeDefaultMarketTemplate(input.defaultMarketTemplate)

  if (defaultAccountTemplate) {
    await supabase
      .from('user_cost_profiles')
      .update({ default_account_template: null })
      .eq('user_id', userId)
      .eq('default_account_template', defaultAccountTemplate)
      .neq('id', profileId)
  }

  if (defaultMarketTemplate) {
    await supabase
      .from('user_cost_profiles')
      .update({ default_market_template: null })
      .eq('user_id', userId)
      .eq('default_market_template', defaultMarketTemplate)
      .neq('id', profileId)
  }
}

export async function saveUserCostProfile(
  input: SaveUserCostProfileInput,
  locale: JournalLocale = 'de',
): Promise<{ success: boolean; message: string; profile?: SavedUserCostProfile }> {
  const text = journalText(locale)
  const title = input.title.trim()
  if (!title) {
    return { success: false, message: text('Bitte einen Namen für das Kostenprofil vergeben.', 'Enter a name for the cost profile.') }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      message: text(`Demo-Flow aktiv. Profil „${title}“ lokal bereit zum Speichern.`, `Cost profile “${title}” prepared in demo mode.`),
      profile: buildMockProfile({ ...input, title }),
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, message: text('Bitte zuerst einloggen.', 'Sign in to manage cost profiles.') }

    const payload = buildPersistPayload(user.id, { ...input, title })

    const { data, error } = await supabase.from('user_cost_profiles').insert(payload).select('*').single()
    if (error || !data) {
      return { success: false, message: text('Kostenprofil konnte nicht gespeichert werden.', 'Could not save the cost profile.') }
    }

    await clearCompetingTemplateDefaults(supabase, user.id, data.id, input)
    const { data: refreshed } = await supabase.from('user_cost_profiles').select('*').eq('id', data.id).single()

    revalidatePath('/trades')
    revalidatePath('/cost-profiles')
    return {
      success: true,
      message: text(`Kostenprofil „${title}“ gespeichert.`, `Cost profile “${title}” saved.`),
      profile: mapUserCostProfileRow((refreshed ?? data) as UserCostProfileRow, 'supabase'),
    }
  } catch {
    return { success: false, message: text('Kostenprofil konnte nicht gespeichert werden.', 'Could not save the cost profile.') }
  }
}

export async function deleteUserCostProfile(
  profileId: string,
  locale: JournalLocale = 'de',
): Promise<{ success: boolean; message: string; deletedId?: string }> {
  const text = journalText(locale)
  if (!profileId.trim()) {
    return { success: false, message: text('Es wurde kein Kostenprofil zum Löschen übergeben.', 'No cost profile was selected for deletion.') }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: true, message: text('Demo-Flow aktiv. Lokales Kostenprofil entfernt.', 'Local cost profile removed in demo mode.'), deletedId: profileId }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, message: text('Bitte zuerst einloggen.', 'Sign in to manage cost profiles.') }

    const { error } = await supabase.from('user_cost_profiles').delete().eq('id', profileId).eq('user_id', user.id)
    if (error) return { success: false, message: text('Kostenprofil konnte nicht gelöscht werden.', 'Could not delete the cost profile.') }

    revalidatePath('/trades')
    revalidatePath('/cost-profiles')
    return { success: true, message: text('Kostenprofil gelöscht.', 'Cost profile deleted.'), deletedId: profileId }
  } catch {
    return { success: false, message: text('Kostenprofil konnte nicht gelöscht werden.', 'Could not delete the cost profile.') }
  }
}

export async function updateUserCostProfile(
  profileId: string,
  input: UpdateUserCostProfileInput,
  locale: JournalLocale = 'de',
): Promise<{ success: boolean; message: string; profile?: SavedUserCostProfile }> {
  const text = journalText(locale)
  const title = input.title.trim()
  if (!profileId.trim()) {
    return { success: false, message: text('Es wurde kein Kostenprofil zum Aktualisieren übergeben.', 'Select a cost profile to update.') }
  }
  if (!title) {
    return { success: false, message: text('Bitte einen Namen für das Kostenprofil vergeben.', 'Enter a name for the cost profile.') }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      message: text(`Demo-Flow aktiv. Profil „${title}“ lokal bereit zum Aktualisieren.`, `Changes to “${title}” prepared in demo mode.`),
      profile: { ...buildMockProfile({ ...input, title }), id: profileId },
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, message: text('Bitte zuerst einloggen.', 'Sign in to manage cost profiles.') }

    const payload = buildPersistPayload(user.id, { ...input, title })
    const { data, error } = await supabase
      .from('user_cost_profiles')
      .update(payload)
      .eq('id', profileId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (error || !data) {
      return { success: false, message: text('Kostenprofil konnte nicht aktualisiert werden.', 'Could not update the cost profile.') }
    }

    await clearCompetingTemplateDefaults(supabase, user.id, profileId, input)
    const { data: refreshed } = await supabase.from('user_cost_profiles').select('*').eq('id', profileId).single()

    revalidatePath('/trades')
    revalidatePath('/cost-profiles')
    return {
      success: true,
      message: text(`Kostenprofil „${title}“ aktualisiert.`, `Cost profile “${title}” updated.`),
      profile: mapUserCostProfileRow((refreshed ?? data) as UserCostProfileRow, 'supabase'),
    }
  } catch {
    return { success: false, message: text('Kostenprofil konnte nicht aktualisiert werden.', 'Could not update the cost profile.') }
  }
}
