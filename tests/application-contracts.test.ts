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

  it('keeps the analytics scope visible and suppresses claims for empty or small samples', () => {
    const workbench = source('components/analytics/statistik-workbench.tsx')
    const filterDeck = source('components/analytics/filter-deck.tsx')

    expect(workbench).toContain('Aktiver Auswertungsscope')
    expect(workbench).toContain('Keine Trades entsprechen dem aktuellen Auswertungsscope.')
    expect(workbench).toContain('Zu wenig Daten für eine belastbare Einordnung.')
    expect(workbench).toContain('Auswertung zurücksetzen')
    expect(workbench).toContain('daraus folgt weiterhin keine Strategie- oder Ausführungsempfehlung')
    expect(workbench).toContain('getAnalyticsBucketEvidenceLabel(row.trades)')
    expect(workbench).toContain("getAnalyticsBucketTone(row.trades, row.tone)")
    expect(workbench).not.toContain('Stark: {row.bestSession}')
    expect(workbench).not.toContain('Prüfen: {row.weakestSession}')
    expect(filterDeck).toContain('Auswertungszeitraum zurücksetzen')
    expect(filterDeck).not.toContain('Zeitraum löschen')
  })

  it('keeps broker egress centralized and deployment runtime default-off', () => {
    const transport = source('lib/server/mexc-transport.ts')
    const requestContract = source('lib/server/mexc-request-contract.ts')
    const adapter = source('lib/server/mexc-readonly.ts')
    const actions = source('app/actions/broker-sync.ts')
    const runtime = source('lib/server/mexc-runtime.ts')

    expect(requestContract).toContain("MEXC_API_ORIGIN = 'https://api.mexc.com'")
    expect(transport).toContain("from '@/lib/server/mexc-request-contract'")
    expect(transport).toContain("import 'server-only'")
    expect(transport).toContain("redirect: 'error'")
    expect(transport).toContain("method: 'GET'")
    expect(transport).toContain("requestHeaders.set('Accept-Encoding', 'identity')")
    expect(transport).toContain('assertResponseUrl(request, response)')
    expect(transport).not.toContain('fetchImpl')
    expect(transport).not.toContain('now?:')
    expect(transport).not.toContain('timeoutMs?:')
    expect(transport).not.toContain('export async function executeMexcPrivateRead(')
    expect(transport).not.toContain('executeMexcPreparedPrivateRead')
    expect(transport).not.toContain('export async function executePreparedRequest')
    expect(source('lib/server/mexc-central-network-transport.ts'))
      .toContain("export { mexcBrokerNetworkTransport } from '@/lib/server/mexc-transport'")
    expect(adapter).not.toMatch(/\bfetch\s*\(/)
    expect(actions).not.toMatch(/\bfetch\s*\(/)
    expect(actions).toContain('isMexcRuntimeActivated()')
    expect(actions).not.toContain('futures_read_verified')
    expect(actions).not.toContain('MEXC wurde sicher verbunden')
    expect(runtime).toContain("MEXC_RUNTIME_GATE = 'g1_deployment_controlled'")
    expect(runtime).toContain("export type MexcRuntimeMode = 'off' | 'probe' | 'capture'")
    expect(runtime).toContain("value === 'probe' || value === 'capture' ? value : 'off'")
    expect(runtime).toContain("getMexcRuntimeMode() === 'capture'")
    expect(runtime).toContain('hasSupabaseServerEnv() && hasBrokerSecretKey() && hasBrokerIdentityKey()')
  })

  it('starts the independent secure-store readiness query with the broker snapshot reads', () => {
    const brokerSync = source('lib/server/broker-sync.ts')
    const promiseStart = brokerSync.indexOf('const secureStoreResponsePromise =')
    const awaitStart = brokerSync.indexOf('] = await Promise.all([')

    expect(promiseStart).toBeGreaterThanOrEqual(0)
    expect(awaitStart).toBeGreaterThan(promiseStart)
    expect(brokerSync).toMatch(/secureStoreResponsePromise,\s*\]\)/)
    expect(brokerSync).toContain(
      'const secureStoreReady = serverAvailable && !secureStoreResponse.error',
    )
  })

  it('validates key versions before decode and clears secret buffers on every encryption exit', () => {
    const identity = source('lib/server/broker-account-identity.ts')
    const secretStore = source('lib/server/broker-secret-store.ts')
    const identityFunction = identity.slice(
      identity.indexOf('export function createMexcBrokerAccountIdentity'),
    )

    expect(identityFunction.indexOf('KEY_VERSION_PATTERN.test(keyVersion)')).toBeLessThan(
      identityFunction.indexOf('decodeIdentityKey()'),
    )
    expect(secretStore.indexOf('try {', secretStore.indexOf('export function encryptBrokerCredentials')))
      .toBeLessThan(secretStore.indexOf('randomBytes(12)'))
    expect(secretStore).toContain('plaintext?.fill(0)')
    expect(secretStore).toContain('clearKeyring(keyring)')
  })

  it('ships without an active cron and keeps the controlled Pro example capacity-bound', () => {
    const production = JSON.parse(source('vercel.json')) as { crons?: unknown[] }
    const example = JSON.parse(source('vercel.capture.pro.example.json')) as {
      crons?: Array<{ path?: string; schedule?: string }>
    }

    expect(production.crons ?? []).toHaveLength(0)
    expect(example.crons).toEqual([{
      path: '/api/internal/broker-capture',
      schedule: '*/5 * * * *',
    }])
  })

  it('keeps broker UI copy honest about transient probes, local refresh and capture data', () => {
    const actions = source('app/actions/broker-sync.ts')
    const panel = source('components/broker-sync/broker-connection-panel.tsx')
    const mexcSetup = source('components/broker-sync/providers/mexc-connection-setup.tsx')
    const connectionView = source('lib/server/broker-connection-view.ts')
    const reviewFixture = source('lib/server/broker-sync-review-fixture.ts')
    const brokerSync = source('lib/server/broker-sync.ts')
    const brokerTypes = source('lib/types/broker-sync.ts')
    const hub = source('components/broker-sync/broker-sync-hub.tsx')
    const appShell = source('components/layout/app-shell.tsx')
    const captureEvidenceQuery = brokerSync.slice(
      brokerSync.indexOf('const activationIdChunks ='),
      brokerSync.indexOf('const captureEvidenceError ='),
    )

    const refreshAction = actions.slice(
      actions.indexOf('export async function refreshMexcPreview'),
      actions.indexOf('export async function removeBrokerConnection'),
    )
    expect(refreshAction).not.toContain('isMexcRuntimeActivated')
    expect(refreshAction).toContain('kein Schedulerlauf und kein Brokerrequest')
    expect(panel).toContain("disabled={isPending}")
    expect(panel).toContain("ready: 'Verbindung angelegt'")
    expect(panel).toContain('label="Letzter qualifizierter Capturelauf"')
    expect(panel).toContain("return 'Kein qualifizierter Lauf beobachtet'")
    expect(panel).toContain('label="Technischer Leseerfolg"')
    expect(panel).toContain('label="Read-only-Attestierung"')
    expect(panel).toContain('label="Permission-Evidenz"')
    expect(panel).toContain('label="Kontoidentität"')
    expect(panel).toContain('label="Historische Coverage"')
    expect(panel).toContain('canShowBrokerConnectionActions(connection)')
    expect(brokerTypes).toContain("connection.environment === 'live'")
    expect(brokerTypes).toContain('MEXC_CONNECTION_ACTION_STATUSES.has(connection.status)')
    expect(panel).not.toContain('apiKey')
    expect(panel).not.toContain('secretKey')
    expect(panel).not.toContain('credential_reference')
    expect(mexcSetup).toContain('connectMexcBroker')
    expect(mexcSetup).toMatch(/type="checkbox"[\s\S]*required[\s\S]*checked=/u)
    expect(mexcSetup).toContain('router.refresh()')
    expect(mexcSetup).toContain('Ein fehlgeschlagener Probe aktiviert keine Connection')
    expect(mexcSetup).not.toMatch(/console\.(?:log|info|warn|error)/)
    expect(mexcSetup).not.toContain('localStorage')
    expect(mexcSetup).not.toContain('sessionStorage')
    expect(mexcSetup).not.toContain('URLSearchParams')
    expect(connectionView).toContain('hasSanitizedError: Boolean(row.last_error)')
    expect(connectionView).toContain('latestCaptureByConnection')
    expect(connectionView).toContain('connectionIdByActivation.get(run.sync_activation_id)')
    expect(connectionView).toContain("run.status !== 'completed' && run.status !== 'partial'")
    expect(connectionView).not.toContain('row.last_sync_at')
    expect(connectionView).not.toContain('lastError:')
    expect(connectionView).not.toContain('credentialReference:')
    expect(hub).toContain('GET-only Verbindungsprobe speichert keine Rohdaten')
    expect(hub).toContain('In den verfügbaren Laufdaten wurde kein Capturelauf beobachtet')
    expect(hub).toContain('Capture-Daten sind noch keine')
    expect(hub).toContain('Nutzer bestätigt: Read-only-Key')
    expect(hub).toContain('Trading in Equora')
    expect(hub).toContain('In der App nicht implementiert')
    expect(hub).toContain('nicht vollständig verifiziert')
    expect(hub).toContain('externe Provider- und Plattform-Logs sind durch dieses UI-Gate nicht vollständig auditiert')
    expect(hub).toContain('className="mt-5 grid gap-3"')
    expect(hub).toContain('className="flex flex-col items-start gap-2"')
    expect(hub).not.toContain('Equora darf lesen, sonst nichts')
    expect(hub).not.toContain('erscheinen nicht in Protokollen')
    expect(hub).toContain('snapshot.runtimeEnabled')
    expect(hub).toContain('Runtime deaktiviert')
    expect(hub).not.toContain("snapshot.connectorReady ? 'MEXC bereit'")
    expect(hub).not.toContain("snapshot.connectorReady ? 'Freigegeben'")
    expect(reviewFixture).toContain("nodeEnv !== 'development'")
    expect(reviewFixture).toContain("fixtureFlag !== LOCAL_REVIEW_FLAG")
    expect(reviewFixture).toContain('connectorReady: false')
    expect(reviewFixture).toContain('runtimeEnabled: false')
    expect(reviewFixture).toContain("runtimeMode: 'off'")
    expect(reviewFixture).not.toMatch(/apiKey|secretKey|credential_reference/u)
    expect(appShell).toContain('grid min-w-0 gap-5')
    expect(appShell).toContain('aside className="min-w-0')
    expect(brokerSync).toContain(".from('broker_sync_activations')")
    expect(brokerSync).toContain(".select('id,connection_account_id,broker_account_id', { count: 'exact' })")
    expect(brokerSync).toContain(".select('id,connection_id,broker_account_id,status,valid_to', { count: 'exact' })")
    expect(brokerSync).toContain(".order('id', { ascending: true })")
    expect(brokerSync).toContain("query = query.gt('id', afterId)")
    expect(brokerSync).toContain('readAllCountedKeysetPages')
    expect(brokerSync).toContain('historicalAccountById.get(activation.connection_account_id)')
    expect(captureEvidenceQuery).toContain(".in('sync_activation_id', activationIdChunk)")
    expect(captureEvidenceQuery).toContain(".in('status', ['completed', 'partial'])")
    expect(captureEvidenceQuery).toContain(".order('completed_at', { ascending: false })")
    expect(captureEvidenceQuery).toContain('.limit(1)')
    expect(captureEvidenceQuery).not.toContain('.limit(5)')
    expect(captureEvidenceQuery).toContain('mapWithConcurrency')
    expect(captureEvidenceQuery).toContain('CAPTURE_EVIDENCE_QUERY_CONCURRENCY')
    expect(brokerSync).toContain("state: 'unavailable'")
    expect(actions).toContain('ein secret-freies Setup-Intent kann als Auditspur bestehen bleiben')
    expect(actions).not.toContain('kein halbfertiger Setup-Stand akzeptiert')
  })

  it('builds the release ZIP with canonical portable entry names', () => {
    const builder = source('scripts/build-release-artifact.ps1')

    expect(builder).toContain('[IO.Compression.ZipArchive]::new')
    expect(builder).toContain('.Replace([char]92, [char]47)')
    expect(builder).toContain('$entryName.Contains([char]92)')
    expect(builder).toContain('$entryName.StartsWith([char]47)')
    expect(builder).toContain('Extracted ZIP content digest mismatch')
    expect(builder).toContain('Get-FileHash -LiteralPath $verifiedPath -Algorithm SHA256')
    expect(builder).not.toContain('CreateFromDirectory')
  })

})
