import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase', 'schema-patch-v57.60.1.sql'), 'utf8')

describe('v57.60.1 database contracts', () => {
  it('makes journal media private and owner-scoped', () => {
    expect(sql).toContain("set public = false")
    expect(sql).toContain("(storage.foldername(name))[1] = (select auth.uid()::text)")
    expect(sql).toContain('media_cleanup_outbox')
    expect(sql).toContain('equora_owned_media_path_v1')
    expect(sql).toContain('equora_has_pending_upload_intent_v1')
    expect(sql).toContain('equora_register_media_upload_intents_v1')
    expect(sql).toContain('UPLOAD_INTENT_QUOTA_EXCEEDED')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('not_before')
  })

  it('provides atomic graph mutations for trade, setup, import and undo', () => {
    for (const functionName of [
      'equora_create_trade_v1',
      'equora_update_trade_v1',
      'equora_upsert_trade_media_v1',
      'equora_remove_trade_media_v1',
      'equora_delete_trade_v1',
      'equora_save_setup_v1',
      'equora_delete_setup_v1',
      'equora_import_trades_v1',
      'equora_revert_import_v1',
      'equora_add_trade_tags_v1',
      'equora_replace_trade_tags_v1',
      'equora_bulk_add_trade_tag_v1',
      'equora_accept_setup_suggestion_v1',
      'equora_save_review_session_v1',
      'equora_create_broker_connection_service_v1',
    ]) {
      expect(sql).toContain(`function public.${functionName}`)
    }
  })

  it('enforces currency and credential deletion boundaries', () => {
    expect(sql).toContain('trades_monetary_values_require_currency_v57601')
    expect(sql).toContain("('EUR', 'USD', 'GBP', 'USDT', 'USDC')")
    expect(sql).toContain('function public.delete_own_broker_connection')
    expect(sql).toContain('on delete restrict')
    expect(sql).toContain('revoke all on function public.delete_own_broker_connection')
    expect(sql).toContain('review_sessions_monetary_scope_v57601')
    expect(sql).toContain("monetary_scope_kind = 'single'")
  })

  it('does not expose the private credential table through an RLS client policy', () => {
    expect(sql).not.toMatch(/create\s+policy[\s\S]{0,160}on\s+public\.broker_credentials/i)
  })

  it('hardens import batches and browser broker writes behind RPC boundaries', () => {
    expect(sql).toContain('alter table public.trade_import_batches enable row level security')
    expect(sql).toContain('alter table public.trade_import_batches alter column user_id set not null')
    expect(sql).toContain('revoke insert, update, delete on table public.trade_import_batches')
    expect(sql).toContain('revoke insert, update, delete on table public.broker_connections')
  })

  it('blocks destructive legacy media migration until scalar URLs are reconciled', () => {
    expect(sql).toContain('LEGACY_TRADE_MEDIA_RECONCILIATION_REQUIRED')
    expect(sql).toContain('LEGACY_SETUP_MEDIA_RECONCILIATION_REQUIRED')
    expect(sql).toContain('LEGACY_SHARED_MEDIA_RECONCILIATION_REQUIRED')
    expect(sql).toContain('parent_trade.user_id = media.user_id')
    expect(sql).toContain('parent_setup.user_id = media.user_id')
    expect(sql).toContain('trade_media_parent_owner_v57601')
    expect(sql).toContain('setup_media_parent_owner_v57601')
  })
})
