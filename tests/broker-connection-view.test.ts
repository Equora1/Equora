import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/actions/broker-sync', () => ({
  connectMexcBroker: vi.fn(),
  refreshMexcPreview: vi.fn(),
  removeBrokerConnection: vi.fn(),
}))

import {
  isMissingBrokerSchemaError,
  latestCaptureByConnection,
  mapWithConcurrency,
  projectBrokerConnectionSummary,
  readAllCountedKeysetPages,
} from '../lib/server/broker-connection-view'
import {
  BROKER_PROVIDER_PRESENTATIONS,
  canShowBrokerConnectionActions,
  findBrokerProviderPresentation,
} from '../lib/types/broker-sync'
import { getLocalMb4ReviewSnapshot } from '../lib/server/broker-sync-review-fixture'
import { BrokerSyncHub } from '../components/broker-sync/broker-sync-hub'
import type { BrokerSyncSnapshot } from '../lib/server/broker-sync'

const BASE_ROW = {
  id: '10000000-0000-4000-8000-000000000001',
  provider: 'mexc',
  account_label: 'MEXC Hauptkonto',
  environment: 'live',
  status: 'ready',
  permissions: ['read_only_user_attested'] as string[],
  last_error: null,
}

describe('provider-neutral broker connection view', () => {
  it('classifies only explicit PostgreSQL or PostgREST schema codes as missing schema', () => {
    for (const code of ['42P01', '42703', 'PGRST204', 'PGRST205', ' pgrst205 ']) {
      expect(isMissingBrokerSchemaError({ code })).toBe(true)
    }

    expect(isMissingBrokerSchemaError({
      code: '42501',
      message: 'permission denied for table broker_connection_accounts',
    } as never)).toBe(false)
    expect(isMissingBrokerSchemaError({
      code: 'PGRST301',
      message: 'broker_capture_runs is not readable',
    } as never)).toBe(false)
    expect(isMissingBrokerSchemaError({})).toBe(false)
    expect(isMissingBrokerSchemaError(null)).toBe(false)
  })

  it('projects a client-safe summary without tenant, credential or raw error material', () => {
    const summary = projectBrokerConnectionSummary({
      ...BASE_ROW,
      user_id: '20000000-0000-4000-8000-000000000002',
      credential_reference: 'secret://must-not-cross-rsc',
      last_error: 'provider payload: API_SECRET=must-not-render',
    } as never, true)
    const serialized = JSON.stringify(summary)

    expect(summary).toEqual({
      id: BASE_ROW.id,
      providerCode: 'mexc',
      accountLabel: 'MEXC Hauptkonto',
      environment: 'live',
      status: 'ready',
      technicalReadResult: 'not_persisted',
      readOnlyAttestation: 'user_confirmed',
      permissionEvidence: 'not_persisted',
      accountIdentityResult: 'pseudonymous_binding_present',
      historyCoverage: 'not_observed',
      lastCaptureAt: null,
      hasSanitizedError: true,
    })
    expect(serialized).not.toContain('user_id')
    expect(serialized).not.toContain('credential')
    expect(serialized).not.toContain('API_SECRET')
    expect(serialized).not.toContain('last_error')
  })

  it('keeps attestation, technical reads, permission evidence, identity and coverage separate', () => {
    const summary = projectBrokerConnectionSummary({
      ...BASE_ROW,
      permissions: ['historical_orders_read_observed'],
    }, false, {
      state: 'capture_observed',
      lastCaptureAt: '2026-08-22T20:00:00.000Z',
    })

    expect(summary).toMatchObject({
      technicalReadResult: 'legacy_read_observed',
      readOnlyAttestation: 'not_confirmed',
      permissionEvidence: 'limited_read_observed',
      accountIdentityResult: 'not_available',
      historyCoverage: 'capture_observed',
    })
  })

  it('does not treat a legacy connection-probe last_sync_at value as capture evidence', () => {
    const summary = projectBrokerConnectionSummary({
      ...BASE_ROW,
      last_sync_at: '2026-08-22T20:00:00.000Z',
    } as never, true)

    expect(summary).toMatchObject({
      historyCoverage: 'not_observed',
      lastCaptureAt: null,
    })
  })

  it('derives capture evidence only from completed or partial immutable activation bindings', () => {
    const connectionByActivation = new Map([
      ['activation-a-old', 'connection-a-old'],
      ['activation-a-new', 'connection-a-new'],
      ['activation-b', 'connection-b'],
    ])
    const result = latestCaptureByConnection([
      { sync_activation_id: 'activation-a-old', status: 'failed', completed_at: '2026-08-22T23:00:00.000Z' },
      { sync_activation_id: 'activation-a-old', status: 'completed', completed_at: null },
      { sync_activation_id: 'activation-a-old', status: 'partial', completed_at: '2026-08-22T22:00:00.000Z' },
      { sync_activation_id: 'activation-a-new', status: 'completed', completed_at: '2026-08-22T20:00:00.000Z' },
      { sync_activation_id: 'activation-b', status: 'completed', completed_at: 'invalid' },
      { sync_activation_id: 'unbound', status: 'completed', completed_at: '2026-08-22T23:30:00.000Z' },
      { sync_activation_id: 'activation-a-new', status: 'completed', completed_at: '2026-08-22T21:00:00.000Z' },
    ], connectionByActivation)

    expect(Object.fromEntries(result)).toEqual({
      'connection-a-old': '2026-08-22T22:00:00.000Z',
      'connection-a-new': '2026-08-22T21:00:00.000Z',
    })
  })

  it('reads every historical relation row despite a lower server row cap and re-verifies completeness', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }))
    const cursors: Array<string | null> = []
    const result = await readAllCountedKeysetPages(async (afterId) => {
      cursors.push(afterId)
      const remaining = afterId === null ? rows : rows.filter((row) => row.id > afterId)
      return { data: remaining.slice(0, 2), count: remaining.length, error: null }
    }, { pageSize: 5, maxPages: 5 })

    expect(result).toMatchObject({ complete: true, error: null, rows, pageCount: 4 })
    expect(cursors).toEqual([null, 'b', 'd', null])
  })

  it('fails closed when counted keyset pagination is truncated or drifts', async () => {
    const truncated = await readAllCountedKeysetPages(async (afterId) => afterId === null
      ? { data: [{ id: 'a' }], count: 2, error: null }
      : { data: [], count: 1, error: null }, { pageSize: 2, maxPages: 3 })
    expect(truncated).toMatchObject({ complete: false, rows: [], error: { code: 'MB4_PAGINATION_TRUNCATED' } })

    let call = 0
    const drifted = await readAllCountedKeysetPages(async () => {
      call += 1
      return call === 1
        ? { data: [{ id: 'a' }], count: 2, error: null }
        : { data: [{ id: 'b' }], count: 2, error: null }
    }, { pageSize: 1, maxPages: 3 })
    expect(drifted).toMatchObject({ complete: false, rows: [], error: { code: 'MB4_PAGINATION_DRIFT' } })
  })

  it('bounds capture evidence work while preserving result order', async () => {
    let active = 0
    let maximumActive = 0
    const result = await mapWithConcurrency([0, 1, 2, 3, 4], 2, async (value) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return value * 2
    })

    expect(result).toEqual([0, 2, 4, 6, 8])
    expect(maximumActive).toBe(2)
  })

  it('fails closed for unknown provider, environment and status values', () => {
    const summary = projectBrokerConnectionSummary({
      ...BASE_ROW,
      provider: '../dynamic-plugin',
      environment: 'arbitrary',
      status: 'auto_enabled',
    }, false)

    expect(summary).toMatchObject({
      providerCode: 'unknown',
      environment: 'unknown',
      status: 'unknown',
    })
    expect(findBrokerProviderPresentation(summary.providerCode)).toBeNull()
  })

  it('exposes exactly the built MEXC presentation without implying a second provider', () => {
    expect(BROKER_PROVIDER_PRESENTATIONS).toHaveLength(1)
    expect(BROKER_PROVIDER_PRESENTATIONS[0]).toMatchObject({
      providerCode: 'mexc',
      setupComponent: 'mexc_readonly_setup_v1',
      availability: 'built_in',
    })
    expect(BROKER_PROVIDER_PRESENTATIONS[0].readBoundary).toContain('kein Trading')
    expect(findBrokerProviderPresentation('binance')).toBeNull()
  })

  it('shows normal MEXC actions only for explicit live and known status combinations', () => {
    const base = projectBrokerConnectionSummary(BASE_ROW, true)
    expect(canShowBrokerConnectionActions(base)).toBe(true)
    expect(canShowBrokerConnectionActions({ ...base, environment: 'unknown' })).toBe(false)
    expect(canShowBrokerConnectionActions({ ...base, status: 'unknown' })).toBe(false)
    expect(canShowBrokerConnectionActions({ ...base, providerCode: 'unknown' })).toBe(false)
    expect(canShowBrokerConnectionActions({ ...base, status: 'revoked' })).toBe(false)
  })

  it('enables the secret-free review fixture only in explicit local development', () => {
    expect(getLocalMb4ReviewSnapshot({ nodeEnv: 'production', fixtureFlag: 'local_only' })).toBeNull()
    expect(getLocalMb4ReviewSnapshot({ nodeEnv: 'development', fixtureFlag: undefined })).toBeNull()

    const snapshot = getLocalMb4ReviewSnapshot({ nodeEnv: 'development', fixtureFlag: 'local_only' })
    expect(snapshot).not.toBeNull()
    expect(snapshot?.schemaState).toBe('ready')
    expect(snapshot?.secureStoreState).toBe('not_ready')
    expect(snapshot?.connectorState).toBe('not_ready')
    expect(snapshot?.runtimeEnabled).toBe(false)
    expect(snapshot?.runtimeMode).toBe('off')
    expect(snapshot?.readScope).toBe('full_snapshot')
    expect(snapshot?.connections).toHaveLength(3)
    expect(JSON.stringify(snapshot)).not.toMatch(/apiKey|secretKey|credential_reference/u)
  })

  it('renders summary-only unknowns without blocking existing connection actions or inventing missing foundations', () => {
    const snapshot: BrokerSyncSnapshot = {
      connections: [projectBrokerConnectionSummary(BASE_ROW, false, { state: 'unavailable', lastCaptureAt: null })],
      recentRuns: [],
      preview: [],
      schemaState: 'ready',
      secureStoreState: 'not_read',
      connectorState: 'not_read',
      runtimeEnabled: true,
      runtimeMode: 'capture',
      runtimeGate: 'g1_deployment_controlled',
      readScope: 'connection_summary_only',
      source: 'supabase',
      notice: 'Diese Ansicht startet keinen Capturelauf.',
    }

    const html = renderToStaticMarkup(createElement(BrokerSyncHub, { snapshot }))

    expect(html).toContain('Status nicht lesbar; Setupformular nicht verfügbar')
    expect(html).toContain('wurde über diesen begrenzten Read-Pfad nicht gelesen')
    expect(html).toContain('Ansicht aktualisieren')
    expect(html).toContain('Verbindung widerrufen')
    expect(html).toContain('Detailevidenz ist über diesen Read-Pfad nicht verfügbar')
    expect(html).not.toContain('Grundlage fehlt')
    expect(html).not.toContain('Voraussetzungen fehlen')
    expect(html).not.toContain('Secure-Store-Grundlage ist nicht verfügbar')
    expect(html).not.toContain('Aktionen gesperrt')
    expect(html).not.toContain('Neues Setup bleibt gesperrt')
    expect(html).not.toContain('Connector und Capture bleiben fail-closed gesperrt')
  })

  it('renders a transient schema read failure as unknown instead of missing', () => {
    const snapshot: BrokerSyncSnapshot = {
      connections: [],
      recentRuns: [],
      preview: [],
      schemaState: 'unknown',
      secureStoreState: 'not_read',
      connectorState: 'not_read',
      runtimeEnabled: false,
      runtimeMode: 'off',
      runtimeGate: 'g1_deployment_controlled',
      readScope: 'connection_summary_only',
      source: 'supabase',
      notice: 'Die Broker-Verbindungsübersicht konnte gerade nicht gelesen werden.',
    }

    const html = renderToStaticMarkup(createElement(BrokerSyncHub, { snapshot }))

    expect(html).toContain('Status nicht lesbar')
    expect(html).not.toContain('Grundlage fehlt')
  })
})
