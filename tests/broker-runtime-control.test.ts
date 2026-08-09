import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  applyMexcConnectionSetupWithClient,
  applyMexcConnectionRevocationWithClient,
  findClaimableBrokerCaptureWorkUnitWithClient,
  findPendingYieldedBrokerCaptureWorkUnitWithClient,
  findPendingBrokerCaptureScopeFinalizationWithClient,
  finalizeBrokerCaptureScopeWithClient,
  loadBrokerCaptureMaterialWithClient,
  requestMexcConnectionSetupWithClient,
  requestMexcConnectionRevocationWithClient,
} from '../lib/server/broker-runtime-control'

const ID = '10000000-0000-4000-8000-000000000001'
const ID2 = '20000000-0000-4000-8000-000000000002'
const ID3 = '30000000-0000-4000-8000-000000000003'
const ID4 = '40000000-0000-4000-8000-000000000004'
const ID5 = '50000000-0000-4000-8000-000000000005'

function client(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) }
}

describe('broker runtime control adapters', () => {
  it('submits a secret-free authenticated setup intent', async () => {
    const rpcClient = client({
      commandId: ID, commandStatus: 'pending', result: null, authorityBlocked: true,
    })
    await expect(requestMexcConnectionSetupWithClient(rpcClient as never, {
      requestId: ID, accountLabel: 'MEXC Hauptkonto', symbols: ['BTC_USDT'],
    })).resolves.toMatchObject({ commandId: ID, commandStatus: 'pending' })
    expect(rpcClient.rpc).toHaveBeenCalledWith('equora_request_mexc_connection_setup_v1', {
      p_request_id: ID,
      p_account_label: 'MEXC Hauptkonto',
      p_symbols: ['BTC_USDT'],
      p_read_only_attested: true,
    })
    expect(JSON.stringify(rpcClient.rpc.mock.calls)).not.toContain('secretKey')
  })

  it('accepts only the closed read-only setup result', async () => {
    const result = {
      status: 'connection_activated', connectionId: ID, connectionAccountId: ID2,
      brokerAccountId: ID3, activationSeriesId: ID4, syncActivationId: ID5,
      activationGeneration: 1, seriesRowVersion: 8, activationRowVersion: 9,
      requirementCount: 12, symbolCount: 2, automaticImportAuthorized: false,
      probeEvidencePersistence: 'transient_not_persisted',
      tradingAuthorized: false, authorityBlocked: true,
    }
    const input = {
      commandId: ID,
      encryptedPayload: 'encrypted-envelope',
      credentialKeyVersion: 'activev2',
      accountIdentityDigest: 'a'.repeat(64),
      accountIdentityKeyVersion: 'idv1',
      integrityKeyBase64: Buffer.alloc(32, 1).toString('base64'),
    }
    await expect(applyMexcConnectionSetupWithClient(client(result) as never, input))
      .resolves.toMatchObject({
        status: 'connection_activated', automaticImportAuthorized: false,
        tradingAuthorized: false,
      })
    await expect(applyMexcConnectionSetupWithClient(client({
      ...result, tradingAuthorized: true,
    }) as never, input)).rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('validates claimable and crash-recovery hints as closed unions', async () => {
    await expect(findClaimableBrokerCaptureWorkUnitWithClient(client({
      status: 'claimable', workUnitId: ID, workUnitRowVersion: 3, authorityBlocked: true,
    }) as never)).resolves.toEqual({
      status: 'claimable', workUnitId: ID, workUnitRowVersion: 3, authorityBlocked: true,
    })
    await expect(findPendingBrokerCaptureScopeFinalizationWithClient(client({
      status: 'pending', requestAuthorizationId: ID2, authorityBlocked: true,
    }) as never)).resolves.toEqual({
      status: 'pending', requestAuthorizationId: ID2, authorityBlocked: true,
    })
    await expect(findPendingBrokerCaptureScopeFinalizationWithClient(client({
      status: 'no_pending', requestAuthorizationId: ID2, authorityBlocked: true,
    }) as never)).rejects.toMatchObject({ code: 'database_result_invalid' })
    await expect(findPendingYieldedBrokerCaptureWorkUnitWithClient(client({
      status: 'pending', workUnitId: ID3, workUnitRowVersion: 7,
      authorityBlocked: true,
    }) as never)).resolves.toEqual({
      status: 'pending', workUnitId: ID3, workUnitRowVersion: 7,
      authorityBlocked: true,
    })
    await expect(findPendingYieldedBrokerCaptureWorkUnitWithClient(client({
      status: 'no_pending', workUnitId: ID3, workUnitRowVersion: null,
      authorityBlocked: true,
    }) as never)).rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('binds revocation to an authenticated intent and rejects a non-revoked result', async () => {
    const requestClient = client({
      commandId: ID, commandStatus: 'pending', result: null, authorityBlocked: true,
    })
    await expect(requestMexcConnectionRevocationWithClient(requestClient as never, {
      connectionId: ID2, requestId: ID,
    })).resolves.toMatchObject({ commandId: ID, commandStatus: 'pending' })
    expect(requestClient.rpc).toHaveBeenCalledWith('equora_request_mexc_connection_revocation_v1', {
      p_connection_id: ID2, p_request_id: ID,
    })

    const revoked = {
      status: 'revoked', activationSeriesId: ID2, syncActivationId: ID3,
      activationGeneration: 1, seriesRowVersion: 4, activationRowVersion: 3,
      authorityEpoch: 4, connectionId: ID4, credentialsRevoked: true,
      automaticImportAuthorized: false, tradingAuthorized: false, authorityBlocked: true,
    }
    await expect(applyMexcConnectionRevocationWithClient(client(revoked) as never, ID))
      .resolves.toMatchObject({ status: 'revoked', credentialsRevoked: true })
    await expect(applyMexcConnectionRevocationWithClient(client({
      ...revoked, credentialsRevoked: false,
    }) as never, ID)).rejects.toMatchObject({ code: 'database_result_invalid' })
  })

  it('loads only version-bound material and keeps finalization non-importing', async () => {
    await expect(loadBrokerCaptureMaterialWithClient(client({
      status: 'material_loaded', requestAuthorizationId: ID, userId: ID2,
      providerCode: 'mexc', brokerAccountId: ID3, connectionAccountId: ID4,
      syncActivationId: ID5, activationGeneration: 1,
      credentialReference: { id: ID, keyVersion: 'activev2' },
      encryptedPayload: 'encrypted-envelope',
      integrityKeyReference: { id: ID2, keyVersion: 'ikv1' },
      integrityKeyBase64: Buffer.alloc(32, 2).toString('base64'),
      sendDeadlineAt: '2026-08-08T12:00:00.000Z', authorityBlocked: true,
    }) as never, ID)).resolves.toMatchObject({
      status: 'material_loaded', providerCode: 'mexc', activationGeneration: 1,
    })

    await expect(finalizeBrokerCaptureScopeWithClient(client({
      status: 'scope_finalized', requestAuthorizationId: ID,
      scopeId: ID2, laneStateId: ID3, watermarkTimeMs: 1_760_000_000_000,
      watermarkTieBreaker: '123', laneResult: { status: 'lane_healthy' },
      automaticImportAuthorized: false, tradingAuthorized: false, authorityBlocked: true,
    }) as never, { requestAuthorizationId: ID, requestId: ID4 })).resolves.toMatchObject({
      status: 'scope_finalized', automaticImportAuthorized: false,
      tradingAuthorized: false,
    })
  })
})
