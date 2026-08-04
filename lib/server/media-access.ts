import type { SupabaseClient } from '@supabase/supabase-js'
import type { SetupMediaRow, TradeMediaRow } from '@/lib/types/db'
import {
  assertOwnedSetupMediaPath,
  assertOwnedTradeMediaPath,
  EQUORA_MEDIA_BUCKET,
  EQUORA_MEDIA_SIGNED_URL_TTL_SECONDS,
} from '@/lib/utils/media-security'

export { assertOwnedSetupMediaPath, assertOwnedTradeMediaPath }

async function signPath(supabase: SupabaseClient, path: string) {
  const { data, error } = await supabase.storage
    .from(EQUORA_MEDIA_BUCKET)
    .createSignedUrl(path, EQUORA_MEDIA_SIGNED_URL_TTL_SECONDS)

  if (error || !data?.signedUrl) return ''
  return data.signedUrl
}

export async function signTradeMediaRows(
  supabase: SupabaseClient,
  rows: TradeMediaRow[],
  expectedUserId: string,
): Promise<TradeMediaRow[]> {
  return Promise.all(rows.map(async (row) => {
    if (row.user_id && row.user_id !== expectedUserId) return { ...row, public_url: '' }
    try {
      assertOwnedTradeMediaPath(expectedUserId, row.trade_id, row.storage_path)
      return { ...row, public_url: await signPath(supabase, row.storage_path) }
    } catch {
      return { ...row, public_url: '' }
    }
  }))
}

export async function signSetupMediaRows(
  supabase: SupabaseClient,
  rows: SetupMediaRow[],
  expectedUserId: string,
): Promise<SetupMediaRow[]> {
  return Promise.all(rows.map(async (row) => {
    if (row.user_id && row.user_id !== expectedUserId) return { ...row, public_url: '' }
    try {
      assertOwnedSetupMediaPath(expectedUserId, row.setup_id, row.storage_path)
      return { ...row, public_url: await signPath(supabase, row.storage_path) }
    } catch {
      return { ...row, public_url: '' }
    }
  }))
}
