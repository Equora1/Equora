'use server'

import { revalidatePath } from 'next/cache'
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
): Promise<{ success: boolean; message: string; profile?: SavedUserCostProfile }> {
  const title = input.title.trim()
  if (!title) {
    return { success: false, message: 'Bitte einen Namen für das Kostenprofil vergeben.' }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      message: `Demo-Flow aktiv. Profil „${title}“ lokal bereit zum Speichern.`,
      profile: buildMockProfile({ ...input, title }),
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }

    const payload = buildPersistPayload(user.id, { ...input, title })

    const { data, error } = await supabase.from('user_cost_profiles').insert(payload).select('*').single()
    if (error || !data) {
      return { success: false, message: 'Kostenprofil konnte nicht gespeichert werden.' }
    }

    await clearCompetingTemplateDefaults(supabase, user.id, data.id, input)
    const { data: refreshed } = await supabase.from('user_cost_profiles').select('*').eq('id', data.id).single()

    revalidatePath('/trades')
    revalidatePath('/cost-profiles')
    return {
      success: true,
      message: `Kostenprofil „${title}“ gespeichert.`,
      profile: mapUserCostProfileRow((refreshed ?? data) as UserCostProfileRow, 'supabase'),
    }
  } catch {
    return { success: false, message: 'Kostenprofil konnte nicht gespeichert werden.' }
  }
}

export async function deleteUserCostProfile(
  profileId: string,
): Promise<{ success: boolean; message: string; deletedId?: string }> {
  if (!profileId.trim()) {
    return { success: false, message: 'Es wurde kein Kostenprofil zum Löschen übergeben.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: true, message: 'Demo-Flow aktiv. Lokales Kostenprofil entfernt.', deletedId: profileId }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }

    const { error } = await supabase.from('user_cost_profiles').delete().eq('id', profileId).eq('user_id', user.id)
    if (error) return { success: false, message: 'Kostenprofil konnte nicht gelöscht werden.' }

    revalidatePath('/trades')
    revalidatePath('/cost-profiles')
    return { success: true, message: 'Kostenprofil gelöscht.', deletedId: profileId }
  } catch {
    return { success: false, message: 'Kostenprofil konnte nicht gelöscht werden.' }
  }
}

export async function updateUserCostProfile(
  profileId: string,
  input: UpdateUserCostProfileInput,
): Promise<{ success: boolean; message: string; profile?: SavedUserCostProfile }> {
  const title = input.title.trim()
  if (!profileId.trim()) {
    return { success: false, message: 'Es wurde kein Kostenprofil zum Aktualisieren übergeben.' }
  }
  if (!title) {
    return { success: false, message: 'Bitte einen Namen für das Kostenprofil vergeben.' }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      message: `Demo-Flow aktiv. Profil „${title}“ lokal bereit zum Aktualisieren.`,
      profile: { ...buildMockProfile({ ...input, title }), id: profileId },
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }

    const payload = buildPersistPayload(user.id, { ...input, title })
    const { data, error } = await supabase
      .from('user_cost_profiles')
      .update(payload)
      .eq('id', profileId)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (error || !data) {
      return { success: false, message: 'Kostenprofil konnte nicht aktualisiert werden.' }
    }

    await clearCompetingTemplateDefaults(supabase, user.id, profileId, input)
    const { data: refreshed } = await supabase.from('user_cost_profiles').select('*').eq('id', profileId).single()

    revalidatePath('/trades')
    revalidatePath('/cost-profiles')
    return {
      success: true,
      message: `Kostenprofil „${title}“ aktualisiert.`,
      profile: mapUserCostProfileRow((refreshed ?? data) as UserCostProfileRow, 'supabase'),
    }
  } catch {
    return { success: false, message: 'Kostenprofil konnte nicht aktualisiert werden.' }
  }
}
