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

  it('delegates provider identity and request-row replay protection to SQL v2', () => {
    const action = source('app/actions/trade-import.ts')
    const sql = source('supabase/schema-patch-v57.62.0-trade-import-hardening.sql')

    expect(action).toContain('normalizedDate.toISOString()')
    expect(action).toContain('input.accountCurrency')
    expect(action).toContain('input.accountLabel')
    expect(action).not.toContain('existingSourceIdentityKeys')
    expect(action).not.toContain('seenSourceIdentityKeys')
    expect(action).toContain('p_source_rows:')
    expect(action).toContain('isExplicitCsvImportAccountLabel(batchAccountLabel)')
    expect(sql).toContain("'equora-import-request-row-v1'")
    expect(sql).toContain("v_reserved_source_kind := 'request_row_v1'")
    expect(sql).toContain("'equora-trade-import-financial-snapshot-v1'")
    expect(sql).toContain("raise exception 'INVALID_TRADE_CURRENCY'")
    expect(sql).toContain("'account_currency', upper(btrim(v_trade->>'account_currency'))")
    expect(sql).not.toContain("'account_currency', p_batch->>'account_currency'")
    expect(sql).toContain('v_provider_identity_kind <> v_required_provider_identity_kind')
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

  it('keeps broker snapshot source reads limited to the connection summary relation', () => {
    const brokerSync = source('lib/server/broker-sync.ts')

    expect(brokerSync).toContain(".from('broker_connections')")
    for (const closedRelation of [
      'broker_credentials',
      'broker_connection_accounts',
      'broker_sync_activations',
      'broker_capture_runs',
      'broker_capture_raw_events',
    ]) {
      expect(brokerSync).not.toContain(`.from('${closedRelation}')`)
    }
    expect(brokerSync).toContain("readScope: 'connection_summary_only'")
    expect(brokerSync).toContain("{ state: 'unavailable', lastCaptureAt: null }")
    expect(brokerSync).toContain("schemaState: 'ready'")
    expect(brokerSync).toContain("secureStoreState: 'not_read'")
    expect(brokerSync).toContain("connectorState: 'not_read'")
    expect(brokerSync).not.toContain("'sync_mode'")
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
    const okxStatus = source('components/broker-sync/providers/okx-candidate-status.tsx')
    const connectionView = source('lib/server/broker-connection-view.ts')
    const reviewFixture = source('lib/server/broker-sync-review-fixture.ts')
    const brokerSync = source('lib/server/broker-sync.ts')
    const brokerTypes = source('lib/types/broker-sync.ts')
    const hub = source('components/broker-sync/broker-sync-hub.tsx')
    const catalogUi = source('components/broker-sync/broker-onboarding-catalog.tsx')
    const catalog = source('lib/utils/broker-catalog.ts')
    const appShell = source('components/layout/app-shell.tsx')
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
    expect(okxStatus).toContain('Lokaler Kandidat – Verbindung gesperrt')
    expect(okxStatus).toContain('keine OKX-Zugangsdaten abgefragt')
    expect(okxStatus).toContain('Reale API-Aufrufe, Connection-Apply')
    expect(okxStatus).not.toMatch(/<form|<input|connectOkx|fetch\(/)
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
    expect(hub).toContain('Der schnellste passende Weg zu deinen Trades')
    expect(hub).toContain('brokerCatalogSummary.builtFileProfileCount')
    expect(hub).toContain('<BrokerOnboardingCatalog />')
    expect(hub).not.toContain('/trades?capture=import#trade-editor')
    expect(hub).toContain('brokerFileImportCapability.blockedReason')
    expect(hub).toContain('Das cTrader-Statement-Profil und das lokale MT4-Dateiprofil sind gebaut')
    expect(hub).toContain('MetaTrader 5, DXtrade und direkter Plattform-Sync bleiben inaktiv')
    expect(hub).toContain('brokerFileImportCapability.requiredMigration')
    expect(hub).not.toContain('/trades?capture=import&preset=ctrader-history#trade-editor')
    expect(hub).toContain('MEXC Runtime gebaut, derzeit aus · OKX Kandidat')
    expect(hub).not.toMatch(/500\+|500 Broker|alle Broker automatisch/u)
    expect(catalogUi).toContain('Reine Roadmap – derzeit keine aktive Verbindung')
    expect(catalogUi).toContain('brokerCatalogSummary.platformCount')
    expect(catalogUi).toContain('brokerCatalogSummary.builtFileProfileCount')
    expect(catalogUi).toContain("fileMethod?.availability === 'available'")
    expect(catalogUi).toContain('brokerFileImportCapability.blockedActionLabel')
    expect(catalogUi).toContain("method.availability === 'controlled_candidate'")
    expect(catalog).not.toContain('availability: "available"')
    expect(catalog).toContain('availableFileProfileCount: availableFileProfileKeys.size')
    expect(catalogUi).not.toMatch(/500\+|500 Broker|alle Broker automatisch/u)
    expect(hub).toContain('className="mt-5 grid gap-3"')
    expect(hub).toContain('className="flex flex-col items-start gap-2"')
    expect(hub).not.toContain('Equora darf lesen, sonst nichts')
    expect(hub).not.toContain('erscheinen nicht in Protokollen')
    expect(hub).toContain('snapshot.runtimeEnabled')
    expect(hub).toContain("snapshot.readScope === 'full_snapshot'")
    expect(hub).toContain('Status nicht lesbar; Setupformular nicht verfügbar')
    expect(hub).not.toContain('Status nicht lesbar; Aktionen gesperrt')
    expect(hub).toContain('nicht als fehlende Brokerdaten interpretiert')
    expect(hub).toContain('wird nicht als leer ausgegeben')
    expect(hub).not.toContain('Patches v57.60 + v57.60.1 nötig')
    expect(hub).toContain('Runtime deaktiviert')
    expect(hub).not.toContain('snapshot.schemaReady')
    expect(hub).not.toContain('snapshot.connectorReady')
    expect(hub).not.toContain('snapshot.secureStoreReady')
    expect(mexcSetup).toContain("connectorState === 'not_read'")
    expect(mexcSetup).toContain('Das Setupformular dieser Ansicht ist deshalb nicht verfügbar')
    expect(mexcSetup).not.toContain('Neues Setup bleibt gesperrt')
    expect(mexcSetup).not.toContain('Die serverseitige Secure-Store-Grundlage ist nicht verfügbar')
    expect(reviewFixture).toContain("nodeEnv !== 'development'")
    expect(reviewFixture).toContain("fixtureFlag !== LOCAL_REVIEW_FLAG")
    expect(reviewFixture).toContain("connectorState: 'not_ready'")
    expect(reviewFixture).toContain("secureStoreState: 'not_ready'")
    expect(reviewFixture).toContain('runtimeEnabled: false')
    expect(reviewFixture).toContain("runtimeMode: 'off'")
    expect(reviewFixture).not.toMatch(/apiKey|secretKey|credential_reference/u)
    expect(appShell).toContain('grid min-w-0 gap-4')
    expect(appShell).toContain('xl:grid-cols-[272px_minmax(0,1fr)]')
    expect(appShell).toContain('aside className="min-w-0')
    expect(brokerSync).toContain(".from('broker_connections')")
    expect(brokerSync).not.toMatch(/\.from\('broker_(?:credentials|connection_accounts|sync_activations|capture_runs|capture_raw_events)'\)/u)
    expect(brokerSync).toContain("state: 'unavailable'")
    expect(brokerSync).toContain('Diese Ansicht startet keinen Capturelauf')
    expect(brokerSync).not.toContain('Connector und Capture bleiben fail-closed gesperrt')
    expect(actions).toContain('ein secret-freies Setup-Intent kann als Auditspur bestehen bleiben')
    expect(actions).not.toContain('kein halbfertiger Setup-Stand akzeptiert')
  })

  it('keeps the modern dashboard bound to trusted and currency-comparable journal data', () => {
    const page = source('app/(journal)/dashboard/page.tsx')
    const overview = source('components/dashboard/dashboard-overview.tsx')
    const equity = source('components/dashboard/equity-curve-card.tsx')
    const recentTrades = source('components/dashboard/recent-trades-card.tsx')
    const dashboardModel = source('lib/utils/dashboard.ts')
    const journal = source('lib/server/journal.ts')

    expect(page).toContain('getDashboardSnapshotServer')
    expect(page).toContain('source={snapshot.source}')
    expect(page).toContain('availability={snapshot.availability}')
    expect(overview).toContain('buildDashboardMetricModel(trades)')
    expect(overview).toContain('getDashboardMoneyLockReason')
    expect(overview).toContain("dataState === 'demo'")
    expect(overview).toContain("dataState === 'unavailable' || dataState === 'unauthenticated'")
    expect(overview).not.toContain("Währungen fehlen oder sind gemischt")
    expect(overview).toContain('Offene oder widersprüchliche Datensätze werden nicht still eingerechnet')
    expect(overview).toContain('role="progressbar"')
    expect(overview).toContain('aria-valuenow={coverage}')
    expect(equity).toContain('buildEquitySeries(trades)')
    expect(equity).toContain('getMonetaryScopeMessage(series.monetaryScope)')
    expect(equity).toContain('Kumuliertes Netto-P&amp;L')
    expect(equity).not.toContain('Kumulierte Equity')
    expect(recentTrades).toContain('lg:grid-cols-[0.85fr_1fr_1fr_0.8fr_0.7fr_0.7fr]')
    expect(recentTrades).toContain('getTradeTrustMeta(trade)')
    expect(recentTrades).toContain('getDashboardRObservation(trade)')
    expect(dashboardModel).toContain("source === 'realized' || source === 'realized_partial' || source === 'manual'")
    expect(dashboardModel).toContain("if (availability === 'unavailable') return 'unavailable'")
    expect(dashboardModel).toContain("if (trustedTradeCount === 0) return 'Keine belastbaren Abschlüsse'")
    expect(dashboardModel).toContain("if (scopeKind === 'mixed') return 'Mehrere Währungen ohne Umrechnungskurs'")
    expect(journal).toContain('export type DashboardJournalSnapshot = JournalSnapshot &')
    expect(journal).toContain('failOnRelatedDataError: true')
    expect(journal).toContain('return result.snapshot')
    expect(journal).toContain('availability: result.availability')

    for (const content of [overview, equity, recentTrades, source('components/dashboard/stats-grid.tsx'), source('components/layout/sidebar-nav.tsx')]) {
      expect(content).not.toMatch(/text-white\/(?:30|35|38|42|45)\b/u)
    }
  })

  it('derives the active sidebar capture state directly from the current query', () => {
    const sidebar = source('components/layout/sidebar-nav.tsx')

    expect(sidebar).toContain("import { usePathname, useSearchParams } from 'next/navigation'")
    expect(sidebar).toContain("const activeCapture = searchParams.get('capture')")
    expect(sidebar).toContain('[activeCapture, pathname]')
    expect(sidebar).not.toContain('setActiveCapture')
  })

  it('uses route-specific headings and keeps timeline evidence legible', () => {
    const sidebar = source('components/layout/sidebar-nav.tsx')
    const brokerHub = source('components/broker-sync/broker-sync-hub.tsx')
    const trades = source('components/trades/trades-workbench.tsx')
    const timeline = source('components/trades/trade-activity-timeline.tsx')

    expect(sidebar).not.toContain('<h1')
    expect(sidebar).toContain('aria-label="Equora Trading Journal – Startseite"')
    expect(brokerHub).toContain('<h1 className="mt-1 text-2xl')
    expect(trades).toContain('<h1 className="mt-2 text-2xl')
    expect(timeline).not.toContain('text-[9px]')
    expect(timeline).not.toContain('text-white/35')
    expect(timeline).toContain('text-[11px] uppercase')
    expect(timeline).toContain('text-xs leading-5 text-white/55')
  })

  it('enforces one fail-closed file-import capability across every visible entry point', () => {
    const capability = source('lib/utils/broker-file-import-capability.ts')
    const catalog = source('lib/utils/broker-catalog.ts')
    const hub = source('components/broker-sync/broker-sync-hub.tsx')
    const catalogUi = source('components/broker-sync/broker-onboarding-catalog.tsx')
    const workbench = source('components/trades/trades-workbench.tsx')
    const ledger = source('components/trades/trade-ledger-capture.tsx')
    const panel = source('components/trades/trade-import-panel.tsx')
    const captureDeck = source('components/trades/trade-capture-deck.tsx')
    const dashboardStart = source('components/dashboard/simple-start-card.tsx')
    const reviewEmptyState = source('components/review/review-empty-state-card.tsx')
    const login = source('app/login/page.tsx')
    const action = source('app/actions/trade-import.ts')

    expect(capability).toContain('const deploymentState: BrokerFileImportDeploymentState = "migration_pending"')
    expect(capability).toContain('persistenceEnabled: false')
    expect(capability).toContain('previewEnabled: true')
    expect(capability).toContain('requiredMigration: "v57.62.0"')
    expect(capability).toContain('previewActionLabel: "Datei prüfen"')
    expect(capability).toContain('blockedActionLabel: "DB-Gate ausstehend"')

    for (const consumer of [
      catalog,
      hub,
      catalogUi,
      workbench,
      ledger,
      panel,
      captureDeck,
      dashboardStart,
      reviewEmptyState,
      login,
      action,
    ]) {
      expect(consumer).toContain('brokerFileImportCapability')
    }

    for (const entryPoint of [
      catalogUi,
      workbench,
      ledger,
      dashboardStart,
      reviewEmptyState,
    ]) {
      expect(entryPoint).not.toContain('href="/trades?capture=import')
    }

    expect(panel).toContain('if (!brokerFileImportCapability.persistenceEnabled)')
    expect(panel).toContain('setStatusMessage(brokerFileImportCapability.blockedReason)')
    expect(panel).toContain('!brokerFileImportCapability.persistenceEnabled')
    expect(panel).toContain('aria-describedby="file-import-deployment-status"')
    expect(panel).toContain('Vorschau wirkt sauber')
    expect(panel).not.toContain('Import wirkt sauber')
    expect(panel).not.toContain('dann importieren')
    expect(action).toContain('if (!brokerFileImportCapability.persistenceEnabled)')
    expect(captureDeck).toContain("label: brokerFileImportCapability.previewActionLabel")
    expect(login).not.toContain('CSV importieren')
  })

  it('keeps detected and manually selected broker import profiles visibly distinct', () => {
    const importPanel = source('components/trades/trade-import-panel.tsx')

    expect(importPanel).toContain('const requestedPreset = searchParams.get("preset")')
    expect(importPanel).toContain('isCsvImportPresetKey(requestedPreset) ? requestedPreset : "generic"')
    expect(importPanel).toContain('Dateisignatur und gewähltes Preset widersprechen sich')
    expect(importPanel).toContain('aktiv bleibt')
    expect(importPanel).toContain('Bitte Auswahl und Zuordnung vor der Vorschau prüfen')
    expect(importPanel).toContain('aria-atomic="true"')
    expect(importPanel.match(/role="status"/g)).toHaveLength(2)
    expect(importPanel.match(/aria-live="polite"/g)).toHaveLength(2)
    expect(importPanel).toContain('getCsvImportPresetMeta(preset).sourceIdentity')
    expect(importPanel).toContain('!isExplicitCsvImportAccountLabel(normalizedAccountLabel)')
    expect(importPanel).toContain('„Hauptkonto“ reicht nicht')
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
