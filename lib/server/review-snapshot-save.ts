import 'server-only'
import type { TradeRow, ReviewSessionRow } from '@/lib/types/db'
import type { TradeTag } from '@/lib/types/tag'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { buildReviewSnapshotSummary } from '@/lib/utils/review-snapshot-summary'
import { parseTradingNumber } from '@/lib/utils/calculations'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function normalizeReviewTradeIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.some((id) => typeof id !== 'string' || !UUID.test(id.trim()))) throw new Error('INVALID_REVIEW_SCOPE')
  const ids = [...new Set(input.map((id: string) => id.trim().toLowerCase()))].sort()
  if (!ids.length || ids.length > 2000) throw new Error('INVALID_REVIEW_SCOPE')
  return ids
}

type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }
export class ReviewSnapshotCommitError extends Error {
  constructor(public readonly sourceChanged: boolean) { super(sourceChanged ? 'REVIEW_SOURCE_CHANGED' : 'REVIEW_COMMIT_UNCONFIRMED') }
}

export async function saveTrustedReviewSnapshot(
  client: RpcClient, ownerId: string, sessionId: string, requestedIds: string[], meta: Record<string, unknown>,
): Promise<ReviewSessionRow> {
  if (!UUID.test(ownerId) || !UUID.test(sessionId)) throw new Error('INVALID_REVIEW_IDENTITY')
  const ids = normalizeReviewTradeIds(requestedIds)
  const source = await client.rpc('equora_review_source_v2', { p_user_id: ownerId, p_trade_ids: ids })
  if (source.error || typeof source.data !== 'string' || source.data.length > 4 * 1024 * 1024) throw new Error('REVIEW_SOURCE_UNAVAILABLE')
  const snapshot = JSON.parse(source.data) as { version: string; owner: string; trades: TradeRow[]; tags: TradeTag[] }
  if (snapshot.version !== 'review-source-v2' || snapshot.owner !== ownerId || !Array.isArray(snapshot.trades)
    || !Array.isArray(snapshot.tags) || snapshot.tags.length > 100000) throw new Error('INVALID_REVIEW_SOURCE')
  const actualIds = snapshot.trades.map((row) => row.id).sort()
  if (JSON.stringify(actualIds) !== JSON.stringify(ids) || snapshot.trades.some((row) => row.user_id !== ownerId)) throw new Error('REVIEW_SOURCE_OWNER_OR_SCOPE_MISMATCH')
  const selected = new Set(ids)
  if (snapshot.tags.some((tag) => !selected.has(tag.trade_id) || typeof tag.tag !== 'string')) throw new Error('INVALID_REVIEW_TAG_SOURCE')
  const summary = buildReviewSnapshotSummary(snapshot.trades.map((row) => mapTradeRowToTrade(row)), snapshot.tags)
  // The exact database-produced text is compared under the SQL write fence.
  let saved
  try { saved = await client.rpc('equora_commit_review_snapshot_v2', {
    p_user_id: ownerId, p_session_id: sessionId, p_trade_ids: ids,
    p_source_text: source.data, p_summary: summary, p_meta: meta,
  }) } catch { throw new ReviewSnapshotCommitError(false) }
  if (saved.error || !saved.data || typeof saved.data !== 'object') {
    const message = saved.error && typeof saved.error === 'object' && 'message' in saved.error ? saved.error.message : null
    throw new ReviewSnapshotCommitError(message === 'REVIEW_SOURCE_CHANGED')
  }
  const row = saved.data as ReviewSessionRow
  if (row.id !== sessionId || row.user_id !== ownerId || row.calculation_version !== summary.calculationVersion
    || row.r_count !== summary.rCount || row.excluded_r_count !== summary.excludedRCount
    || row.trade_count !== summary.tradeCount || JSON.stringify(row.trade_ids) !== JSON.stringify(ids)
    || parseTradingNumber(row.average_r) !== summary.averageR || parseTradingNumber(row.net_pnl) !== summary.netPnL
    || row.monetary_scope_kind !== summary.monetaryScopeKind || row.currency !== summary.currency) throw new ReviewSnapshotCommitError(false)
  return row
}
