'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { collectJournalRows } from '@/lib/server/collect-journal-rows'
import { normalizeTradeCurrency } from '@/lib/utils/currency'
import { planTradeCurrencyCorrection, type CurrencyCorrectionRow, type CurrencyCorrectionScope } from '@/lib/utils/trade-currency-correction'

type Selection = { currency: string; scope: CurrencyCorrectionScope; tradeId?: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const surfaces = ['/dashboard', '/trades', '/statistik', '/kalender', '/review', '/review-sessions', '/setups']

function validSelection(input: Selection) {
  return input && typeof input.currency === 'string' && normalizeTradeCurrency(input.currency)
    && (input.scope === 'all' || input.scope === 'missing')
    && (input.tradeId === undefined || (typeof input.tradeId === 'string' && uuid.test(input.tradeId)))
}

async function readSelection(client: Awaited<ReturnType<typeof createSupabaseAuthServerClient>>, owner: string, input: Selection) {
  return collectJournalRows<CurrencyCorrectionRow>((from, to) => {
    let query = client.from('trades').select('id, account_currency', { count: 'exact' }).eq('user_id', owner)
    if (input.tradeId) query = query.eq('id', input.tradeId)
    return query.order('id', { ascending: true }).range(from, to)
  }, 10_000)
}

function fingerprint(owner: string, input: Selection, rows: CurrencyCorrectionRow[]) {
  return createHash('sha256').update(JSON.stringify([
    owner, normalizeTradeCurrency(input.currency), input.scope, input.tradeId ?? null,
    rows.map(row => [row.id, row.account_currency]),
  ])).digest('hex')
}

export async function previewTradeCurrencyCorrection(input: Selection) {
  if (!validSelection(input)) return { success: false as const, message: 'Bitte Währung und Umfang prüfen.' }
  if (!hasSupabaseClientEnv()) return { success: false as const, message: 'Im Demo-Modus werden keine Währungen gespeichert.' }
  try {
    const client = await createSupabaseAuthServerClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return { success: false as const, message: 'Bitte erneut anmelden.' }
    const rows = await readSelection(client, user.id, input)
    if (input.tradeId && rows.length !== 1) return { success: false as const, message: 'Der Trade ist nicht verfügbar.' }
    const { summary } = planTradeCurrencyCorrection(rows, normalizeTradeCurrency(input.currency)!, input.scope)
    return { success: true as const, token: fingerprint(user.id, input, rows), summary }
  } catch {
    return { success: false as const, message: 'Die Vorschau konnte nicht vollständig geladen werden. Es wurde nichts geändert.' }
  }
}

export async function applyTradeCurrencyCorrection(input: Selection & { token: string; confirmed: boolean }) {
  let saved = 0
  let attempted = false
  if (!validSelection(input) || input.confirmed !== true || typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) {
    return { success: false, saved, message: 'Bitte die Vorschau laden und die Ergebniswährung bestätigen.' }
  }
  if (!hasSupabaseClientEnv()) return { success: false, saved, message: 'Im Demo-Modus werden keine Währungen gespeichert.' }
  try {
    const client = await createSupabaseAuthServerClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return { success: false, saved, message: 'Bitte erneut anmelden.' }
    const rows = await readSelection(client, user.id, input)
    if (fingerprint(user.id, input, rows) !== input.token) {
      return { success: false, saved, message: 'Die Trade-Auswahl oder eine Währung hat sich geändert. Bitte eine neue Vorschau laden.' }
    }
    const currency = normalizeTradeCurrency(input.currency)!
    const { batches } = planTradeCurrencyCorrection(rows, currency, input.scope)
    for (const batch of batches) {
      attempted = true
      // Authenticated RLS client, owner, exact IDs and original currency are all required.
      let query = client.from('trades').update({ account_currency: currency }).eq('user_id', user.id).in('id', batch.ids)
      query = batch.previous === null ? query.is('account_currency', null) : query.eq('account_currency', batch.previous)
      const response = await query.select('id')
      if (response.error || !Array.isArray(response.data)) throw new Error('CURRENCY_UPDATE_UNCERTAIN')
      const returnedIds = new Set(response.data.map(row => row.id))
      if (returnedIds.size !== response.data.length || response.data.some(row => !batch.ids.includes(row.id))) throw new Error('CURRENCY_UPDATE_UNCERTAIN')
      saved += response.data.length
      if (response.data.length !== batch.ids.length) {
        return { success: false, saved, message: `${saved} Währungsangaben gespeichert. Nicht alle vorgesehenen Änderungen konnten bestätigt werden. Bitte den aktuellen Stand prüfen und eine neue Vorschau laden.` }
      }
    }
    return { success: true, saved, message: `${saved} ${saved === 1 ? 'Währungsangabe' : 'Währungsangaben'} auf ${currency} gesetzt. Die gespeicherten Beträge wurden nicht umgerechnet.` }
  } catch {
    return { success: false, saved, message: attempted
      ? `Für ${saved} Trades ist die Änderung bestätigt. Der letzte Speicherschritt konnte nicht bestätigt werden. Bitte neu laden und den Stand prüfen; es erfolgt keine automatische Wiederholung.`
      : 'Die Auswahl konnte nicht vollständig geprüft werden. Es wurde nichts geändert.' }
  } finally {
    if (attempted) for (const path of surfaces) revalidatePath(path)
  }
}
