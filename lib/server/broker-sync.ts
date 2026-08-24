import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasBrokerSecretKey } from '@/lib/server/broker-secret-store'
import { hasBrokerIdentityKey } from '@/lib/server/broker-account-identity'
import {
  latestCaptureByConnection,
  mapWithConcurrency,
  projectBrokerConnectionSummary,
  readAllCountedKeysetPages,
} from '@/lib/server/broker-connection-view'
import { getLocalMb4ReviewSnapshot } from '@/lib/server/broker-sync-review-fixture'
import { mapCaptureRawEventToPreview } from '@/lib/server/broker-preview'
import { getMexcRuntimeMode, MEXC_RUNTIME_GATE } from '@/lib/server/mexc-runtime'
import type { MexcRuntimeMode } from '@/lib/server/mexc-runtime'
import type {
  BrokerCaptureRunSummary,
  BrokerConnectionSummary,
  BrokerPreviewItem,
} from '@/lib/types/broker-sync'
import type { BrokerConnectionRow } from '@/lib/types/db'

export type BrokerSyncSnapshot = {
  connections: BrokerConnectionSummary[]
  recentRuns: BrokerCaptureRunSummary[]
  preview: BrokerPreviewItem[]
  schemaReady: boolean
  secureStoreReady: boolean
  connectorReady: boolean
  runtimeEnabled: boolean
  runtimeMode: MexcRuntimeMode
  runtimeGate: typeof MEXC_RUNTIME_GATE
  source: 'demo' | 'supabase'
  notice: string | null
}

type CapturePreviewRow = Readonly<{
  id: string
  broker_account_id: string
  event_type: string
  external_event_id: string | null
  provider_occurred_at_us: number | string | null
  raw_payload: unknown
}>

type BrokerConnectionAccountProjection = Readonly<{
  id: string
  connection_id: string
  broker_account_id: string
  status: string
  valid_to: string | null
}>

type BrokerSyncActivationProjection = Readonly<{
  id: string
  connection_account_id: string
  broker_account_id: string
}>

type CaptureEvidenceRunProjection = Readonly<{
  sync_activation_id: string
  status: string
  completed_at: string | null
}>

const ACTIVATION_ID_QUERY_CHUNK_SIZE = 50
const CAPTURE_EVIDENCE_QUERY_CONCURRENCY = 3
const HISTORICAL_RELATION_PAGE_SIZE = 200
const HISTORICAL_RELATION_MAX_PAGES = 500

const CONNECTION_SELECT = [
  'id',
  'provider',
  'account_label',
  'environment',
  'status',
  'permissions',
  'sync_mode',
  'last_error',
  'created_at',
].join(',')

const RUN_SELECT = [
  'id',
  'user_id',
  'broker_account_id',
  'sync_activation_id',
  'status',
  'trigger_kind',
  'lane_id',
  'started_at',
  'completed_at',
  'observed_event_count',
  'inserted_raw_event_count',
  'repeated_observation_count',
  'failed_request_count',
  'scope_count',
  'created_at',
].join(',')

const RAW_EVENT_SELECT = [
  'id',
  'broker_account_id',
  'event_type',
  'external_event_id',
  'provider_occurred_at_us',
  'raw_payload',
  'created_at',
].join(',')

function isMissingSchema(message?: string, code?: string) {
  const normalized = message?.toLowerCase() ?? ''
  return code === '42P01'
    || normalized.includes('broker_connections')
    || normalized.includes('broker_connection_accounts')
    || normalized.includes('broker_sync_activations')
    || normalized.includes('broker_capture_runs')
    || normalized.includes('broker_capture_raw_events')
}

function emptySnapshot(overrides: Partial<BrokerSyncSnapshot> = {}): BrokerSyncSnapshot {
  const runtimeMode = getMexcRuntimeMode()

  return {
    connections: [],
    recentRuns: [],
    preview: [],
    schemaReady: false,
    secureStoreReady: false,
    connectorReady: false,
    runtimeEnabled: runtimeMode !== 'off',
    runtimeMode,
    runtimeGate: MEXC_RUNTIME_GATE,
    source: 'supabase',
    notice: null,
    ...overrides,
  }
}

export async function getBrokerSyncSnapshotServer(userId?: string | null): Promise<BrokerSyncSnapshot> {
  const localReviewSnapshot = getLocalMb4ReviewSnapshot({
    nodeEnv: process.env.NODE_ENV,
    fixtureFlag: process.env.EQUORA_MB4_REVIEW_FIXTURE,
  })
  if (localReviewSnapshot) return localReviewSnapshot

  if (!hasSupabaseClientEnv()) {
    return emptySnapshot({
      schemaReady: true,
      source: 'demo',
      notice: 'Demo-Modus: Für eine echte MEXC-Verbindung müssen zuerst die Supabase-Variablen hinterlegt werden.',
    })
  }

  try {
    const scopedUserId = userId ?? null
    const serverAvailable = hasSupabaseServerEnv()
    const supabase = scopedUserId && serverAvailable
      ? createSupabaseServerClient()
      : await createSupabaseAuthServerClient()

    if (!scopedUserId && serverAvailable) {
      return emptySnapshot({ notice: 'Kein Nutzerkonto für die Broker-Verbindung verfügbar.' })
    }

    let resolvedUserId = scopedUserId
    if (!resolvedUserId) {
      const { data: { user } } = await supabase.auth.getUser()
      resolvedUserId = user?.id ?? null
    }
    if (!resolvedUserId) {
      return emptySnapshot({ notice: 'Bitte anmelden, um einen Broker zu verbinden.' })
    }

    const secureStoreResponsePromise = serverAvailable
      ? createSupabaseServerClient()
          .from('broker_credentials')
          .select('id')
          .eq('user_id', resolvedUserId)
          .limit(1)
      : Promise.resolve({ data: null, error: null })
    const accountsResponsePromise = readAllCountedKeysetPages<BrokerConnectionAccountProjection>(async (afterId) => {
      let query = supabase
        .from('broker_connection_accounts')
        .select('id,connection_id,broker_account_id,status,valid_to', { count: 'exact' })
        .eq('user_id', resolvedUserId)
        .order('id', { ascending: true })
        .limit(HISTORICAL_RELATION_PAGE_SIZE)
      if (afterId !== null) query = query.gt('id', afterId)
      const response = await query
      return {
        data: (response.data ?? []) as unknown as BrokerConnectionAccountProjection[],
        count: response.count,
        error: response.error,
      }
    }, {
      pageSize: HISTORICAL_RELATION_PAGE_SIZE,
      maxPages: HISTORICAL_RELATION_MAX_PAGES,
    })
    const activationsResponsePromise = readAllCountedKeysetPages<BrokerSyncActivationProjection>(async (afterId) => {
      let query = supabase
        .from('broker_sync_activations')
        .select('id,connection_account_id,broker_account_id', { count: 'exact' })
        .eq('user_id', resolvedUserId)
        .order('id', { ascending: true })
        .limit(HISTORICAL_RELATION_PAGE_SIZE)
      if (afterId !== null) query = query.gt('id', afterId)
      const response = await query
      return {
        data: (response.data ?? []) as unknown as BrokerSyncActivationProjection[],
        count: response.count,
        error: response.error,
      }
    }, {
      pageSize: HISTORICAL_RELATION_PAGE_SIZE,
      maxPages: HISTORICAL_RELATION_MAX_PAGES,
    })
    const [
      connectionsResponse,
      accountsResponse,
      activationsResponse,
      runsResponse,
      previewResponse,
      secureStoreResponse,
    ] = await Promise.all([
      supabase
        .from('broker_connections')
        .select(CONNECTION_SELECT)
        .eq('user_id', resolvedUserId)
        .order('created_at', { ascending: false }),
      accountsResponsePromise,
      activationsResponsePromise,
      supabase
        .from('broker_capture_runs')
        .select(RUN_SELECT)
        .eq('user_id', resolvedUserId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('broker_capture_raw_events')
        .select(RAW_EVENT_SELECT)
        .eq('user_id', resolvedUserId)
        .in('event_type', ['order', 'execution'])
        .order('provider_occurred_at_us', { ascending: false, nullsFirst: false })
        .limit(30),
      secureStoreResponsePromise,
    ])

    const relationEvidenceError = accountsResponse.error ?? activationsResponse.error
    const firstError = connectionsResponse.error ?? runsResponse.error ?? previewResponse.error
    if (relationEvidenceError && isMissingSchema(relationEvidenceError.message, relationEvidenceError.code)) {
      return emptySnapshot({
        notice: 'Die Broker-Grundlage fehlt noch. Bitte zuerst den SQL-Patch v57.52 in Supabase ausführen.',
      })
    }
    if (firstError) {
      if (isMissingSchema(firstError.message, firstError.code)) {
        return emptySnapshot({
          notice: 'Die Broker-Grundlage fehlt noch. Bitte zuerst den SQL-Patch v57.52 in Supabase ausführen.',
        })
      }

      return emptySnapshot({
        notice: 'Die Broker-Daten konnten gerade nicht gelesen werden. Es wurden keine Zugangsdaten verändert.',
      })
    }

    const secureStoreReady = serverAvailable && !secureStoreResponse.error

    const accountRows = relationEvidenceError ? [] : accountsResponse.rows
    const activationRows = relationEvidenceError ? [] : activationsResponse.rows
    const activeAccountRows = accountRows.filter((row) => row.status === 'active' && row.valid_to === null)
    const activeConnectionByAccount = new Map(
      activeAccountRows.map((row) => [row.broker_account_id, row.connection_id]),
    )
    const accountBoundConnectionIds = new Set(
      activeAccountRows.map((row) => row.connection_id),
    )
    const historicalAccountById = new Map(accountRows.map((row) => [row.id, row]))
    const connectionIdByActivation = new Map<string, string>()
    const activationIdsByConnection = new Map<string, string[]>()

    for (const activation of activationRows) {
      const historicalAccount = historicalAccountById.get(activation.connection_account_id)
      if (!historicalAccount || historicalAccount.broker_account_id !== activation.broker_account_id) continue
      connectionIdByActivation.set(activation.id, historicalAccount.connection_id)
      const activationIds = activationIdsByConnection.get(historicalAccount.connection_id) ?? []
      activationIds.push(activation.id)
      activationIdsByConnection.set(historicalAccount.connection_id, activationIds)
    }

    const activationIdChunks = [...activationIdsByConnection.values()].flatMap((activationIds) => {
      const chunks: string[][] = []
      for (let index = 0; index < activationIds.length; index += ACTIVATION_ID_QUERY_CHUNK_SIZE) {
        chunks.push(activationIds.slice(index, index + ACTIVATION_ID_QUERY_CHUNK_SIZE))
      }
      return chunks
    })
    const captureEvidenceResponses = relationEvidenceError
      ? []
      : await mapWithConcurrency(
        activationIdChunks,
        CAPTURE_EVIDENCE_QUERY_CONCURRENCY,
        async (activationIdChunk) => supabase
        .from('broker_capture_runs')
        .select('sync_activation_id,status,completed_at')
        .eq('user_id', resolvedUserId)
        .in('sync_activation_id', activationIdChunk)
        .in('status', ['completed', 'partial'])
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1),
      )
    const captureEvidenceError = relationEvidenceError
      ?? captureEvidenceResponses.find((response) => response.error)?.error
      ?? null

    if (captureEvidenceError && isMissingSchema(captureEvidenceError.message, captureEvidenceError.code)) {
      return emptySnapshot({
        notice: 'Die Broker-Grundlage fehlt noch. Bitte zuerst den SQL-Patch v57.52 in Supabase ausführen.',
      })
    }

    const recentRuns = (runsResponse.data ?? []) as unknown as BrokerCaptureRunSummary[]
    const captureEvidenceRows = captureEvidenceResponses.flatMap(
      (response) => (response.data ?? []) as unknown as CaptureEvidenceRunProjection[],
    )
    const lastCaptureByConnection = latestCaptureByConnection(
      captureEvidenceRows,
      connectionIdByActivation,
    )
    const previewRows = (previewResponse.data ?? []) as unknown as CapturePreviewRow[]
    const preview = previewRows.flatMap((row) => {
      const connectionId = activeConnectionByAccount.get(row.broker_account_id)
      return connectionId ? [mapCaptureRawEventToPreview(row, connectionId)] : []
    })
    const runtimeMode = getMexcRuntimeMode()
    const runtimeEnabled = runtimeMode !== 'off'
    const connectorPrerequisitesReady = serverAvailable
      && secureStoreReady
      && hasBrokerSecretKey()
      && hasBrokerIdentityKey()

    return {
      connections: ((connectionsResponse.data ?? []) as unknown as BrokerConnectionRow[])
        .map((connection) => {
          const lastCaptureAt = lastCaptureByConnection.get(connection.id) ?? null
          return projectBrokerConnectionSummary(
            connection,
            accountBoundConnectionIds.has(connection.id),
            captureEvidenceError
              ? { state: 'unavailable', lastCaptureAt: null }
              : lastCaptureAt
                ? { state: 'capture_observed', lastCaptureAt }
                : { state: 'not_observed', lastCaptureAt: null },
          )
        }),
      recentRuns,
      preview,
      schemaReady: true,
      secureStoreReady,
      connectorReady: connectorPrerequisitesReady && runtimeEnabled,
      runtimeEnabled,
      runtimeMode,
      runtimeGate: MEXC_RUNTIME_GATE,
      source: 'supabase',
      notice: captureEvidenceError
        ? 'Die Capture-Evidenz konnte nicht vollständig gelesen werden. Fehlende Laufdaten werden deshalb nicht als Nichtvorhandensein ausgegeben.'
        : connectorPrerequisitesReady
        ? runtimeEnabled
          ? 'MEXC Read-only ist für einen ausdrücklich ausgelösten Verbindungscheck vorbereitet. Automatische Rohdatenerfassung ist nur im separaten Capture-Modus aktiv; Journalimport bleibt aus.'
          : 'Der MEXC-Connector ist per MEXC_RUNTIME_MODE=off deaktiviert. Es werden keine Brokerrequests ausgeführt.'
        : null,
    }
  } catch {
    return emptySnapshot({
      notice: 'Die Broker-Verbindung ist derzeit nicht erreichbar. Es wurden keine Zugangsdaten übertragen.',
    })
  }
}
