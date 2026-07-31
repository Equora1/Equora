import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasBrokerSecretKey } from '@/lib/server/broker-secret-store'
import { mapRawEventToPreview } from '@/lib/server/broker-preview'
import type { BrokerPreviewItem } from '@/lib/types/broker-sync'
import type { BrokerConnectionRow, BrokerRawEventRow, BrokerSyncRunRow } from '@/lib/types/db'

export type BrokerSyncSnapshot = {
  connections: BrokerConnectionRow[]
  recentRuns: BrokerSyncRunRow[]
  preview: BrokerPreviewItem[]
  schemaReady: boolean
  secureStoreReady: boolean
  connectorReady: boolean
  source: 'demo' | 'supabase'
  notice: string | null
}

const CONNECTION_SELECT = [
  'id',
  'user_id',
  'provider',
  'account_label',
  'environment',
  'status',
  'permissions',
  'sync_mode',
  'last_sync_at',
  'last_error',
  'created_at',
  'updated_at',
].join(',')

const RUN_SELECT = [
  'id',
  'user_id',
  'connection_id',
  'status',
  'started_at',
  'finished_at',
  'fetched_count',
  'imported_count',
  'duplicate_count',
  'skipped_count',
  'error_count',
  'summary',
  'created_at',
].join(',')

const RAW_EVENT_SELECT = [
  'id',
  'connection_id',
  'event_type',
  'external_event_id',
  'occurred_at',
  'payload',
  'created_at',
].join(',')

function isMissingSchema(message?: string, code?: string) {
  const normalized = message?.toLowerCase() ?? ''
  return code === '42P01'
    || normalized.includes('broker_connections')
    || normalized.includes('broker_sync_runs')
    || normalized.includes('broker_raw_events')
}

function emptySnapshot(overrides: Partial<BrokerSyncSnapshot> = {}): BrokerSyncSnapshot {
  return {
    connections: [],
    recentRuns: [],
    preview: [],
    schemaReady: false,
    secureStoreReady: false,
    connectorReady: false,
    source: 'supabase',
    notice: null,
    ...overrides,
  }
}

export async function getBrokerSyncSnapshotServer(userId?: string | null): Promise<BrokerSyncSnapshot> {
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

    const [connectionsResponse, runsResponse, previewResponse] = await Promise.all([
      supabase
        .from('broker_connections')
        .select(CONNECTION_SELECT)
        .eq('user_id', resolvedUserId)
        .order('created_at', { ascending: false }),
      supabase
        .from('broker_sync_runs')
        .select(RUN_SELECT)
        .eq('user_id', resolvedUserId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('broker_raw_events')
        .select(RAW_EVENT_SELECT)
        .eq('user_id', resolvedUserId)
        .order('occurred_at', { ascending: false, nullsFirst: false })
        .limit(30),
    ])

    const firstError = connectionsResponse.error ?? runsResponse.error ?? previewResponse.error
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

    let secureStoreReady = false
    if (serverAvailable) {
      const serviceClient = createSupabaseServerClient()
      const { error } = await serviceClient
        .from('broker_credentials')
        .select('id')
        .eq('user_id', resolvedUserId)
        .limit(1)
      secureStoreReady = !error
    }

    return {
      connections: (connectionsResponse.data ?? []) as unknown as BrokerConnectionRow[],
      recentRuns: (runsResponse.data ?? []) as unknown as BrokerSyncRunRow[],
      preview: ((previewResponse.data ?? []) as unknown as BrokerRawEventRow[]).map(mapRawEventToPreview),
      schemaReady: true,
      secureStoreReady,
      connectorReady: serverAvailable && secureStoreReady && hasBrokerSecretKey(),
      source: 'supabase',
      notice: null,
    }
  } catch {
    return emptySnapshot({
      notice: 'Die Broker-Verbindung ist derzeit nicht erreichbar. Es wurden keine Zugangsdaten übertragen.',
    })
  }
}
