import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('v57.60.1 application safety contracts', () => {
  it('serves private media through short-lived signed URLs and compensates failed uploads', () => {
    const storage = source('lib/supabase/storage.ts')
    const access = source('lib/server/media-access.ts')

    expect(storage).not.toContain('getPublicUrl')
    expect(storage).toContain('createSignedUrl')
    expect(storage).toContain('registerPendingMediaUploads')
    expect(storage).toContain('requestUncommittedMediaCleanup')
    expect(access).toContain('EQUORA_MEDIA_SIGNED_URL_TTL_SECONDS')
  })

  it('protects the cleanup worker with a timing-safe bearer-secret check', () => {
    const route = source('app/api/maintenance/media-cleanup/route.ts')

    expect(route).toContain("request.headers.get('authorization')")
    expect(route).toContain('replace(/^Bearer\\s+/i')
    expect(route).toContain('timingSafeEqual')
    expect(route).toContain('EQUORA_MAINTENANCE_SECRET')
    expect(route).toContain('processPendingMediaCleanup(50)')
  })

  it('routes tag graph changes through transactional RPCs', () => {
    const actions = source('app/actions/trade-tags.ts')

    expect(actions).toContain("rpc('equora_replace_trade_tags_v1'")
    expect(actions).toContain("rpc('equora_bulk_add_trade_tag_v1'")
    expect(actions).not.toMatch(/from\('trade_tags'\)\.(?:insert|delete|upsert)/)
  })

  it('persists review currency scope and blocks cross-currency deltas', () => {
    const actions = source('app/actions/review-sessions.ts')
    const hub = source('components/review/review-sessions-hub.tsx')

    expect(actions).toContain("rpc('equora_save_review_session_v1'")
    expect(actions).not.toContain("from('review_sessions').insert")
    expect(hub).toContain("left.currency === right.currency")
    expect(hub).toContain("'Gesperrt'")
  })

  it('preserves an unknown legacy edit currency instead of inventing one from presets', () => {
    const form = source('components/trades/trade-form.tsx')

    expect(form).toContain('const initialAccountCurrency = isEditMode')
    expect(form).toContain("initialValues?.accountCurrency?.trim() || ''")
  })

  it('uploads setup media before one atomic graph save', () => {
    const studio = source('components/setups/setup-studio.tsx')
    const saveBlock = studio.slice(studio.indexOf('function handleSave()'), studio.indexOf('function handleSetMaster'))

    expect(saveBlock).toContain('uploaded = await uploadSetupImages')
    expect(saveBlock.match(/saveSetupEntry\(/g)).toHaveLength(1)
  })

  it('fails closed when cleanup reference checks fail', () => {
    const cleanup = source('lib/server/media-cleanup.ts')

    expect(cleanup).toContain('reference_check_failed')
    expect(cleanup).toContain('tradeReferenceResult.error')
    expect(cleanup).toContain('setupReferenceResult.error')
  })

  it('keeps a grace period after ambiguous media finalization failures', () => {
    const cleanupAction = source('app/actions/media-cleanup.ts')

    expect(cleanupAction).toContain("rpc('equora_register_media_upload_intents_v1'")
    expect(cleanupAction).toContain('AMBIGUOUS_FINALIZE_GRACE_MS')
    expect(cleanupAction).toContain("last_error: 'ambiguous_finalize_cleanup_requested'")
    expect(cleanupAction).not.toContain('processMediaCleanupForPaths')
    expect(cleanupAction).not.toContain('not_before: now')
  })

  it('uses exact timestamp, currency and account identity for CSV duplicate checks', () => {
    const action = source('app/actions/trade-import.ts')

    expect(action).toContain('date.toISOString()')
    expect(action).toContain('input.accountCurrency')
    expect(action).toContain('input.accountLabel')
    expect(action).toContain('input.accountTemplate')
    expect(action).toContain('input.brokerProfile')
  })
})
