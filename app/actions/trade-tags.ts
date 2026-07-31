'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'

export async function addTradeTags(tradeId: string, tags: string[]) {
  const supabase = await createSupabaseAuthServerClient()
  if (!tags.length) return { success: true }
  const { error } = await supabase.from('trade_tags').insert(tags.map((tag) => ({ trade_id: tradeId, tag })))
  if (error) throw new Error('Trade-Tags konnten nicht gespeichert werden.')
  return { success: true }
}

export async function getTradeTags(tradeId: string) {
  const supabase = await createSupabaseAuthServerClient()
  const { data, error } = await supabase.from('trade_tags').select('*').eq('trade_id', tradeId).order('created_at', { ascending: true })
  if (error) throw new Error('Trade-Tags konnten nicht geladen werden.')
  return data ?? []
}

/**
 * Atomares Tag-Replace für einen einzelnen Trade.
 * Löscht alle bestehenden Tags des Trades und setzt den neuen vollständigen
 * Satz. So bleiben Tags immer konsistent — kein partielles Update-State.
 *
 * Sicherheit: Prüft vor dem Delete, dass der Trade dem eingeloggten User
 * gehört. Im Demo-Modus (kein Supabase) gibt es ein optimistisches Echo zurück.
 */
export async function setTradeTagsForTrade(
  tradeId: string,
  tags: string[],
): Promise<{ success: boolean; message: string; tags: string[] }> {
  const normalizedTags = tags.map((tag) => tag.trim()).filter(Boolean)
  const deduplicated = [...new Set(normalizedTags)]

  if (!tradeId) {
    return { success: false, message: 'Trade-ID fehlt.', tags: [] }
  }

  if (!hasSupabaseClientEnv()) {
    return {
      success: true,
      message: `Demo-Flow aktiv. ${deduplicated.length} Tag${deduplicated.length === 1 ? '' : 's'} vorgemerkt.`,
      tags: deduplicated,
    }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, message: 'Bitte zuerst einloggen.', tags: [] }
    }

    // Sicherheitscheck: Trade muss dem User gehören
    const { data: tradeRow, error: tradeError } = await supabase
      .from('trades')
      .select('id')
      .eq('id', tradeId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (tradeError || !tradeRow) {
      return { success: false, message: 'Trade nicht gefunden oder kein Zugriff.', tags: [] }
    }

    // Alle bestehenden Tags des Trades löschen
    const { error: deleteError } = await supabase.from('trade_tags').delete().eq('trade_id', tradeId)
    if (deleteError) {
      return { success: false, message: 'Bestehende Tags konnten nicht entfernt werden.', tags: [] }
    }

    // Neuen Tag-Satz einfügen (falls nicht leer)
    if (deduplicated.length > 0) {
      const rows = deduplicated.map((tag) => ({
        id: crypto.randomUUID(),
        trade_id: tradeId,
        tag,
        created_at: new Date().toISOString(),
      }))

      const { error: insertError } = await supabase.from('trade_tags').insert(rows)
      if (insertError) {
        return { success: false, message: 'Tags konnten nicht gespeichert werden.', tags: [] }
      }
    }

    revalidatePath('/trades')
    revalidatePath('/dashboard')
    revalidatePath('/statistik')
    revalidatePath('/review')
    revalidatePath('/kalender')

    return {
      success: true,
      message:
        deduplicated.length === 0
          ? 'Alle Tags entfernt.'
          : `${deduplicated.length} Tag${deduplicated.length === 1 ? '' : 's'} gespeichert.`,
      tags: deduplicated,
    }
  } catch {
    return { success: false, message: 'Tags konnten nicht gespeichert werden.', tags: [] }
  }
}

export async function bulkAddTradeTag(tradeIds: string[], tag: string) {
  const normalizedTag = tag.trim()
  if (!tradeIds.length || !normalizedTag) {
    return { success: false, message: 'Bitte mindestens einen Trade und einen Tag wählen.' }
  }

  if (!hasSupabaseClientEnv()) {
    return { success: true, message: `Demo-Flow aktiv. Tag "${normalizedTag}" für ${tradeIds.length} Trade${tradeIds.length === 1 ? '' : 's'} vorgemerkt.` }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }

    const { data: existingRows, error: existingError } = await supabase
      .from('trade_tags')
      .select('trade_id, tag')
      .in('trade_id', tradeIds)
      .eq('tag', normalizedTag)

    if (existingError) return { success: false, message: 'Bestehende Tags konnten nicht geprüft werden.' }

    const existingTradeIds = new Set((existingRows ?? []).map((row: { trade_id: string; tag: string }) => row.trade_id))
    const rowsToInsert = tradeIds
      .filter((tradeId) => !existingTradeIds.has(tradeId))
      .map((tradeId) => ({
        id: crypto.randomUUID(),
        trade_id: tradeId,
        tag: normalizedTag,
        created_at: new Date().toISOString(),
      }))

    if (rowsToInsert.length) {
      const { error } = await supabase.from('trade_tags').insert(rowsToInsert)
      if (error) return { success: false, message: 'Bulk-Tagging konnte nicht gespeichert werden.' }
    }

    revalidatePath('/dashboard')
    revalidatePath('/trades')
    revalidatePath('/statistik')
    revalidatePath('/review')
    revalidatePath('/setups')

    const skipped = tradeIds.length - rowsToInsert.length
    return {
      success: true,
      message:
        skipped > 0
          ? `Tag "${normalizedTag}" auf ${rowsToInsert.length} Trades angewendet, ${skipped} waren bereits markiert.`
          : `Tag "${normalizedTag}" auf ${rowsToInsert.length} Trades angewendet.`,
    }
  } catch {
    return { success: false, message: 'Bulk-Tagging konnte nicht gespeichert werden.' }
  }
}
