import { getJournalSnapshotServer, TRADE_DETAIL_SELECT_COLUMNS } from '@/lib/server/journal'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { TradeMediaRow, TradeRow } from '@/lib/types/db'
import type { TradeTag } from '@/lib/types/tag'

const TRADE_DETAIL_SELECT_COLUMNS_LEGACY = TRADE_DETAIL_SELECT_COLUMNS
  .split(',')
  .filter((column) => column !== 'import_batch_id')
  .join(',')

function isMissingColumnError(errorMessage: string | undefined, columnName: string) {
  return Boolean(errorMessage?.toLowerCase().includes(columnName.toLowerCase()))
}

export async function getTradesServer(userId?: string | null): Promise<TradeRow[]> {
  const snapshot = await getJournalSnapshotServer(userId)
  return snapshot.tradeRows
}

export async function getTradesServerForUser(userId: string) {
  return getTradesServer(userId)
}

export async function getTradeByIdServer(tradeId: string, userId?: string | null) {
  if (!hasSupabaseClientEnv() || !userId) {
    const rows = await getTradesServer(userId)
    const row = rows.find((item) => item.id === tradeId)
    if (!row) throw new Error('Trade konnte nicht geladen werden.')
    return row
  }

  const supabase = hasSupabaseServerEnv()
    ? createSupabaseServerClient()
    : await createSupabaseAuthServerClient()

  let response = await supabase
    .from('trades')
    .select(TRADE_DETAIL_SELECT_COLUMNS)
    .eq('user_id', userId)
    .eq('id', tradeId)
    .maybeSingle()

  if (isMissingColumnError(response.error?.message, 'import_batch_id')) {
    response = await supabase
      .from('trades')
      .select(TRADE_DETAIL_SELECT_COLUMNS_LEGACY)
      .eq('user_id', userId)
      .eq('id', tradeId)
      .maybeSingle()
  }

  if (response.error || !response.data) {
    throw new Error('Trade konnte nicht geladen werden.')
  }

  return response.data as unknown as TradeRow
}


export async function getTradeCountServer(userId?: string | null): Promise<number> {
  if (!hasSupabaseClientEnv() || !userId) {
    const rows = await getTradesServer(userId)
    return rows.length
  }

  const supabase = hasSupabaseServerEnv()
    ? createSupabaseServerClient()
    : await createSupabaseAuthServerClient()

  const { count, error } = await supabase
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) {
    console.error('Trade count failed:', error.message)
    return 0
  }

  return count ?? 0
}

export async function getTradeMediaCountsServer(
  tradeIds: string[],
  userId?: string | null,
): Promise<Record<string, number>> {
  if (!tradeIds.length) return {}

  if (!hasSupabaseClientEnv() || !userId) {
    const snapshot = await getJournalSnapshotServer(userId)
    return snapshot.tradeMediaRows.reduce<Record<string, number>>((counts, row) => {
      if (tradeIds.includes(row.trade_id)) counts[row.trade_id] = (counts[row.trade_id] ?? 0) + 1
      return counts
    }, {})
  }

  const supabase = hasSupabaseServerEnv()
    ? createSupabaseServerClient()
    : await createSupabaseAuthServerClient()

  const { data, error } = await supabase
    .from('trade_media')
    .select('trade_id')
    .eq('user_id', userId)
    .in('trade_id', tradeIds)

  if (error) {
    console.error('Trade media count failed:', error.message)
    return {}
  }

  return (data ?? []).reduce<Record<string, number>>((counts, row) => {
    counts[row.trade_id] = (counts[row.trade_id] ?? 0) + 1
    return counts
  }, {})
}

export async function getTradeMediaServer(
  tradeId: string,
  userId?: string | null,
): Promise<TradeMediaRow[]> {
  if (!hasSupabaseClientEnv() || !userId) {
    const snapshot = await getJournalSnapshotServer(userId)
    return snapshot.tradeMediaRows.filter((row) => row.trade_id === tradeId)
  }

  const supabase = hasSupabaseServerEnv()
    ? createSupabaseServerClient()
    : await createSupabaseAuthServerClient()

  const { data, error } = await supabase
    .from('trade_media')
    .select('id,trade_id,user_id,created_at,storage_path,public_url,file_name,mime_type,byte_size,sort_order,is_primary')
    .eq('user_id', userId)
    .eq('trade_id', tradeId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Trade media fetch failed:', error.message)
    return []
  }

  return (data ?? []) as TradeMediaRow[]
}

export async function getTradeTagsServer(
  tradeId: string,
  userId?: string | null,
): Promise<TradeTag[]> {
  if (!hasSupabaseClientEnv() || !userId) {
    const snapshot = await getJournalSnapshotServer(userId)
    return snapshot.tradeTags.filter((row) => row.trade_id === tradeId)
  }

  const supabase = hasSupabaseServerEnv()
    ? createSupabaseServerClient()
    : await createSupabaseAuthServerClient()

  const { data, error } = await supabase
    .from('trade_tags')
    .select('id,trade_id,user_id,created_at,tag')
    .eq('user_id', userId)
    .eq('trade_id', tradeId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Trade tags fetch failed:', error.message)
    return []
  }

  return (data ?? []) as TradeTag[]
}
