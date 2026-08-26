import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hasClientEnv: vi.fn(),
  hasServerEnv: vi.fn(),
  createAuthClient: vi.fn(),
  createServerClient: vi.fn(),
  getReviewFixture: vi.fn(),
  getRuntimeMode: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/config', () => ({
  hasSupabaseClientEnv: mocks.hasClientEnv,
  hasSupabaseServerEnv: mocks.hasServerEnv,
}))
vi.mock('@/lib/supabase/server-auth', () => ({
  createSupabaseAuthServerClient: mocks.createAuthClient,
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: mocks.createServerClient,
}))
vi.mock('@/lib/server/broker-sync-review-fixture', () => ({
  getLocalMb4ReviewSnapshot: mocks.getReviewFixture,
}))
vi.mock('@/lib/server/mexc-runtime', () => ({
  getMexcRuntimeMode: mocks.getRuntimeMode,
  MEXC_RUNTIME_GATE: 'g1_deployment_controlled',
}))

import { getBrokerSyncSnapshotServer } from '../lib/server/broker-sync'

type QueryError = Readonly<{ code?: string; message: string }> | null
type QueryResponse = Readonly<{ data: readonly Record<string, unknown>[] | null; error: QueryError }>

function mockSupabase(response: QueryResponse, userId: string | null = null) {
  const query = {
    select(_columns: string) {
      return query
    },
    eq(_column: string, _value: string) {
      return query
    },
    async order(_column: string, _options: Readonly<{ ascending: boolean }>) {
      return response
    },
  }
  const select = vi.spyOn(query, 'select')
  const eq = vi.spyOn(query, 'eq')
  const order = vi.spyOn(query, 'order')
  const from = vi.fn((_relation: string) => query)
  const getUser = vi.fn(async () => ({ data: { user: userId ? { id: userId } : null }, error: null }))

  return { client: { from, auth: { getUser } }, query: { select, eq, order }, from, getUser }
}

const CONNECTION = {
  id: '10000000-0000-4000-8000-000000000001',
  provider: 'mexc',
  account_label: 'MEXC Hauptkonto',
  environment: 'live',
  status: 'ready',
  permissions: ['read_only_user_attested'],
  last_error: 'sanitized provider error exists',
  created_at: '2026-08-22T20:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasClientEnv.mockReturnValue(true)
  mocks.hasServerEnv.mockReturnValue(true)
  mocks.getReviewFixture.mockReturnValue(null)
  mocks.getRuntimeMode.mockReturnValue('off')
})

describe('broker sync server snapshot', () => {
  it('reads only tenant-scoped connection summaries and marks unread details unknown', async () => {
    const supabase = mockSupabase({ data: [CONNECTION], error: null })
    mocks.createServerClient.mockReturnValue(supabase.client)

    const snapshot = await getBrokerSyncSnapshotServer('user-1')

    expect(supabase.from).toHaveBeenCalledOnce()
    expect(supabase.from).toHaveBeenCalledWith('broker_connections')
    expect(supabase.query.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(supabase.query.select).toHaveBeenCalledWith(expect.not.stringContaining('sync_mode'))
    expect(snapshot).toMatchObject({
      schemaState: 'ready',
      secureStoreState: 'not_read',
      connectorState: 'not_read',
      readScope: 'connection_summary_only',
      recentRuns: [],
      preview: [],
    })
    expect(snapshot.connections).toHaveLength(1)
    expect(snapshot.connections[0]).toMatchObject({
      id: CONNECTION.id,
      status: 'ready',
      historyCoverage: 'unavailable',
      hasSanitizedError: true,
    })
    expect(JSON.stringify(snapshot)).not.toContain(CONNECTION.last_error)
  })

  it('classifies only an explicit schema error as missing', async () => {
    const supabase = mockSupabase({
      data: null,
      error: { code: 'PGRST205', message: 'table missing from schema cache' },
    })
    mocks.createServerClient.mockReturnValue(supabase.client)

    const snapshot = await getBrokerSyncSnapshotServer('user-1')

    expect(snapshot.schemaState).toBe('missing')
    expect(snapshot.notice).toContain('Broker-Grundlage fehlt')
  })

  it.each([
    { code: '42501', message: 'permission denied for table broker_connections' },
    { code: 'PGRST301', message: 'authentication failed for broker_connections' },
  ])('keeps non-schema read error $code unknown', async (error) => {
    const supabase = mockSupabase({ data: null, error })
    mocks.createServerClient.mockReturnValue(supabase.client)

    const snapshot = await getBrokerSyncSnapshotServer('user-1')

    expect(snapshot.schemaState).toBe('unknown')
    expect(snapshot.notice).toContain('konnte gerade nicht gelesen werden')
    expect(snapshot.notice).not.toContain('Grundlage fehlt')
  })

  it('keeps thrown transport failures unknown and secret-free', async () => {
    const supabase = mockSupabase({ data: [], error: null })
    supabase.query.order.mockRejectedValueOnce(new Error('transport secret must not cross'))
    mocks.createServerClient.mockReturnValue(supabase.client)

    const snapshot = await getBrokerSyncSnapshotServer('user-1')

    expect(snapshot.schemaState).toBe('unknown')
    expect(snapshot.notice).toContain('derzeit nicht erreichbar')
    expect(JSON.stringify(snapshot)).not.toContain('transport secret')
  })

  it('does not query when the service path has no scoped user', async () => {
    const supabase = mockSupabase({ data: [CONNECTION], error: null })
    mocks.createAuthClient.mockResolvedValue(supabase.client)

    const snapshot = await getBrokerSyncSnapshotServer()

    expect(supabase.from).not.toHaveBeenCalled()
    expect(snapshot.schemaState).toBe('unknown')
    expect(snapshot.notice).toContain('Kein Nutzerkonto')
  })

  it('uses the authenticated user on the anon path and fails closed without one', async () => {
    mocks.hasServerEnv.mockReturnValue(false)
    const authenticated = mockSupabase({ data: [CONNECTION], error: null }, 'auth-user')
    mocks.createAuthClient.mockResolvedValueOnce(authenticated.client)

    const authSnapshot = await getBrokerSyncSnapshotServer()

    expect(authenticated.getUser).toHaveBeenCalledOnce()
    expect(authenticated.query.eq).toHaveBeenCalledWith('user_id', 'auth-user')
    expect(authSnapshot.schemaState).toBe('ready')

    const anonymous = mockSupabase({ data: [CONNECTION], error: null })
    mocks.createAuthClient.mockResolvedValueOnce(anonymous.client)

    const anonymousSnapshot = await getBrokerSyncSnapshotServer()

    expect(anonymous.from).not.toHaveBeenCalled()
    expect(anonymousSnapshot.schemaState).toBe('unknown')
    expect(anonymousSnapshot.notice).toContain('Bitte anmelden')
  })

  it('describes active runtime without claiming that the separate capture authority is blocked', async () => {
    mocks.getRuntimeMode.mockReturnValue('capture')
    const supabase = mockSupabase({ data: [CONNECTION], error: null })
    mocks.createServerClient.mockReturnValue(supabase.client)

    const snapshot = await getBrokerSyncSnapshotServer('user-1')

    expect(snapshot.runtimeEnabled).toBe(true)
    expect(snapshot.connectorState).toBe('not_read')
    expect(snapshot.notice).toContain('Diese Ansicht startet keinen Capturelauf')
    expect(snapshot.notice).not.toContain('Connector und Capture bleiben fail-closed gesperrt')
  })

  it('keeps demo mode schema and dependencies unknown', async () => {
    mocks.hasClientEnv.mockReturnValue(false)

    const snapshot = await getBrokerSyncSnapshotServer('user-1')

    expect(snapshot).toMatchObject({
      source: 'demo',
      schemaState: 'unknown',
      secureStoreState: 'not_read',
      connectorState: 'not_read',
    })
    expect(mocks.createServerClient).not.toHaveBeenCalled()
    expect(mocks.createAuthClient).not.toHaveBeenCalled()
  })
})
