import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  DESCRIPTOR_QUERY_DIGEST_CONTRACT_VERSION,
  PAGE_SEQUENCE_CONTRACT_VERSION,
  computeAuthorityTupleDigest,
  computeBrokerDescriptorQueryDigest,
  computeCanonicalBrokerValueDigest,
  computeCaptureQueryProfileDigest,
  computeCapturePurposeScopeDigest,
  createBrokerRequestPlanningBoundary,
  type BrokerCodeRegistryPort,
  type BrokerConnectionProbeWork,
  type BrokerReadWorkUnit,
  type BrokerRequestPlanningBoundary,
  type CanonicalJsonValue,
  type CaptureChainBinding,
  type ConnectionProbeChainBinding,
  type ProviderCapabilityRef,
  type ReadCapabilityExecutionContract,
  type ReadOnlyBrokerAdapter,
} from '../lib/server/broker-core-contracts'
import { brokerCodeRegistry } from '../lib/server/broker-code-registry'
import {
  MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION,
  MEXC_ADAPTER_VERSION,
  MEXC_PROVIDER_CODE,
  MEXC_PROVIDER_CONTRACT_VERSION,
  MEXC_READONLY_CAPABILITIES,
  canonicalizeMexcProviderPayload,
  mexcReadonlyAdapter,
} from '../lib/server/providers/mexc-readonly-adapter'
import {
  MEXC_API_ORIGIN,
  MexcTransportError,
  canonicalMexcCaptureQueryProfile,
  canonicalMexcQuery,
  parseMexcResponseEnvelope,
  prepareMexcRequest,
  type MexcReadCapabilityId,
} from '../lib/server/mexc-request-contract'

const NOW = 1_760_000_000_000
const HISTORY_QUERY = Object.freeze({
  symbol: 'BTC_USDT',
  start_time: NOW - 100_000,
  end_time: NOW,
  page_num: 1,
  page_size: 20,
})

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => (
    `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`
  )).join(',')}}`
}

function sha256(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function executionContract(descriptor: (typeof MEXC_READONLY_CAPABILITIES)[number]): ReadCapabilityExecutionContract {
  return {
    ref: descriptor.ref,
    mutationContract: descriptor.mutationContract,
    methodContract: descriptor.methodContract,
    constantMethod: descriptor.constantMethod,
    constantHttpsOrigin: descriptor.constantHttpsOrigin,
    constantPort: descriptor.constantPort,
    constantPathTemplate: descriptor.constantPathTemplate,
    authClass: descriptor.authClass,
    dataClass: descriptor.dataClass,
    queryContractVersion: descriptor.queryContractVersion,
    cursorContractVersion: descriptor.cursorContractVersion,
    responseContractVersion: descriptor.responseContractVersion,
    pageSequenceContractVersion: descriptor.pageSequenceContractVersion,
  }
}

function descriptorDigest(contract: ReadCapabilityExecutionContract) {
  const { capabilityDescriptorDigest: _digest, ...ref } = contract.ref
  return sha256({ ...contract, ref })
}

function captureInput(descriptor: (typeof MEXC_READONLY_CAPABILITIES)[number], requestInput: CanonicalJsonValue) {
  if (!requestInput || typeof requestInput !== 'object' || Array.isArray(requestInput)) {
    throw new Error('capture fixture request input must be an object')
  }
  const query = requestInput as Record<string, CanonicalJsonValue>
  const capabilityId = descriptor.ref.providerCapabilityId as MexcReadCapabilityId
  const captureQueryProfileDigest = computeCaptureQueryProfileDigest({
    provider: descriptor.ref,
    queryContractVersion: descriptor.queryContractVersion,
    stableCanonicalQuery: canonicalMexcCaptureQueryProfile(capabilityId, requestInput),
  })
  const scope = {
    instrumentScopeKey: String(query.symbol).toUpperCase(),
    requestWindowStartUs: Object.prototype.hasOwnProperty.call(query, 'start_time')
      ? String(BigInt(Number(query.start_time)) * BigInt(1_000))
      : '0',
    requestWindowEndUs: Object.prototype.hasOwnProperty.call(query, 'end_time')
      ? String(BigInt(Number(query.end_time)) * BigInt(1_000))
      : '0',
    positionType: Object.prototype.hasOwnProperty.call(query, 'position_type')
      ? String(query.position_type) as '1' | '2'
      : null,
    captureQueryProfileDigest,
  }
  const authority: Record<string, any> = {
    authorityTupleContractVersion: 'equora-broker-authority-tuple-v1',
    authorityTupleDigest: '',
    authorityPurpose: 'capture',
    userId: 'capture-user-1',
    environment: 'live',
    runtimeAuthority: {
      requiredMode: 'capture',
      runtimeConfigurationDigest: 'runtime-digest',
      deploymentIdentity: 'deployment-identity',
      runtimeAuthorityEpoch: 1,
    },
    provider: descriptor.ref,
    capabilityProfile: { profileId: 'mexc_futures_rest', profileVersion: 'v1', profileDigest: 'profile-digest' },
    commonPolicyPins: {
      runtimePolicyVersion: 'runtime-policy-v1',
      requestAuthorityPolicyVersion: 'request-policy-v1',
      failurePolicyVersion: 'failure-policy-v1',
    },
    purposeScopeDigest: computeCapturePurposeScopeDigest(scope),
    purposeRequestSequence: 1,
    workUnitId: 'capture-work-1',
    expectedWorkUnitRowVersion: 1,
    claim: { claimRequestId: 'claim-1', leaseId: 'lease-1', leaseEpoch: 1, leaseTokenDigest: 'lease-digest' },
    activation: { id: 'activation-1', generation: 1, authorityEpoch: 1 },
    account: {
      brokerAccountId: 'broker-account-1',
      connectionAccountId: 'connection-account-1',
      identityDigest: 'identity-digest',
      identityKeyVersion: 'v1',
    },
    persistentCredentialReference: { id: 'credential-reference-1', keyVersion: 'v1', generation: 1 },
    checkpointContractVersion: MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION,
    capturePolicyPins: {
      claimPolicyVersion: 'claim-policy-v1',
      leasePolicyVersion: 'lease-policy-v1',
      checkpointPolicyVersion: 'checkpoint-policy-v1',
    },
    captureBudget: {
      pageLimit: 10,
      responseByteLimit: 64 * 1024,
      requestDeadlineAt: '2030-01-01T00:00:00.000Z',
    },
  }
  authority.authorityTupleDigest = computeAuthorityTupleDigest(authority as any)
  const chainBinding = {
    chainId: 'capture-chain-1',
    authorityPurpose: 'capture',
    authority,
  }
  return {
    workUnit: {
      chainBinding,
      integrityKeyReference: { id: 'integrity-key-1', keyVersion: 'v1' },
      scope,
      checkpoint: {
        checkpointContractVersion: MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION,
        captureQueryProfileDigest,
        payload: {
          checkpointContractVersion: MEXC_ADAPTER_CHECKPOINT_CONTRACT_VERSION,
          captureQueryProfileDigest,
          providerCapabilityId: descriptor.ref.providerCapabilityId,
          lastPageObservationId: null,
          nextPageNumber: Number(query.page_num ?? 1),
          terminal: false,
        },
        mac: 'checkpoint-mac',
      },
    },
    requestId: 'capture-request-1',
    requestInput,
  } as any
}

function probeRequestBinding(descriptor: (typeof MEXC_READONLY_CAPABILITIES)[number], authority: Record<string, any>) {
  return {
    requestId: 'probe-request-1',
    authorityPurpose: 'connection_probe',
    canonicalUnsignedRequestDigest: '2'.repeat(64),
    provider: descriptor.ref,
    capabilityProfile: authority.capabilityProfile,
    purposeRequestSequence: 1,
    queryDigest: '3'.repeat(64),
    chainBinding: {
      chainId: 'probe-chain-1',
      authorityPurpose: 'connection_probe',
      authority,
    },
  }
}

async function setupProbe(descriptor: (typeof MEXC_READONLY_CAPABILITIES)[number], requestInput: CanonicalJsonValue) {
  const capabilityProfile = { profileId: 'mexc_futures_rest', profileVersion: 'v1', profileDigest: 'profile-digest' }
  const canonicalQuery = canonicalMexcQuery(
    descriptor.ref.providerCapabilityId as MexcReadCapabilityId,
    requestInput,
  ) as unknown as CanonicalJsonValue
  const canonicalDescriptorQueryDigest = computeBrokerDescriptorQueryDigest({
    provider: descriptor.ref,
    capabilityProfile,
    queryContractVersion: descriptor.queryContractVersion,
    canonicalQuery,
  })
  const commandDraft = {
    setupCommandContractVersion: 'equora-broker-connection-setup-command-v2',
    setupCommandId: 'setup-1',
    expectedSetupCommandRowVersion: 1,
    userId: 'user-1',
    environment: 'live',
    provider: descriptor.ref,
    capabilityProfile,
    descriptorQueryDigestContractVersion: DESCRIPTOR_QUERY_DIGEST_CONTRACT_VERSION,
    queryContractVersion: descriptor.queryContractVersion,
    canonicalDescriptorQueryDigest,
    readOnlyAttestation: true,
    probeBudget: {
      cumulativeRequestLimit: 1,
      responseByteLimit: 64 * 1024,
      absoluteDeadlineAt: '2026-08-16T22:00:00.000Z',
    },
    persistenceAuthority: 'secret_free_setup_command_only',
    credentialPersistenceAuthority: 'none_before_atomic_apply',
    captureAuthority: 'none',
    importAuthority: 'none',
  } as const
  const authority = {
    authorityTupleContractVersion: 'equora-broker-authority-tuple-v1',
    authorityTupleDigest: 'probe-authority-digest',
    authorityPurpose: 'connection_probe',
    setupCommandId: commandDraft.setupCommandId,
    expectedSetupCommandRowVersion: commandDraft.expectedSetupCommandRowVersion,
    setupRequestDigest: computeCanonicalBrokerValueDigest(commandDraft as unknown as CanonicalJsonValue),
    userId: commandDraft.userId,
    environment: commandDraft.environment,
    provider: descriptor.ref,
    capabilityProfile: commandDraft.capabilityProfile,
    runtimeAuthority: {
      requiredMode: 'probe',
      runtimeConfigurationDigest: 'runtime-digest',
      deploymentIdentity: 'deployment-identity',
      runtimeAuthorityEpoch: 1,
    },
    commonPolicyPins: {
      runtimePolicyVersion: 'runtime-policy-v1',
      requestAuthorityPolicyVersion: 'request-policy-v1',
      failurePolicyVersion: 'failure-policy-v1',
    },
    purposeScopeDigest: 'probe-scope-digest',
    purposeRequestSequence: 1,
    connectionProbePolicyPins: {
      setupPolicyVersion: 'setup-policy-v1',
      probePolicyVersion: 'probe-policy-v1',
      ephemeralCredentialPolicyVersion: 'ephemeral-policy-v1',
      applyPolicyVersion: 'apply-policy-v1',
    },
    ephemeralCredentialSession: { sessionId: 'session-1', generation: 1, materialBindingMac: 'session-mac' },
    probeBudget: { ...commandDraft.probeBudget, cumulativeRequestCountBefore: 0 },
  }
  authority.authorityTupleDigest = computeAuthorityTupleDigest(authority as any)
  const command = await createBrokerRequestPlanningBoundary(brokerCodeRegistry).prepareConnectionSetupCommand({
    authority: authority as any,
    requestInput,
  })
  const chainBinding = { chainId: 'probe-chain-1', authorityPurpose: 'connection_probe', authority }
  const requestBinding = probeRequestBinding(descriptor, authority)
  return {
    command,
    authority,
    requestBinding,
    input: {
      probeWork: { chainBinding, setupCommand: command, requestInput },
      requestId: requestBinding.requestId,
      requestInput,
    } as never,
  }
}

function envelope(data: unknown) {
  return new TextEncoder().encode(JSON.stringify({ success: true, code: 0, data }))
}

describe('MEXC provider-neutral read-only adapter facade', () => {
  it('keeps capture and connection-probe planning inputs disjoint at compile time', () => {
    if (false) {
      const boundary = null as unknown as BrokerRequestPlanningBoundary
      const captureWork = null as unknown as BrokerReadWorkUnit<CaptureChainBinding<'capture-chain'>>
      const probeWork = null as unknown as BrokerConnectionProbeWork<ConnectionProbeChainBinding<'probe-chain'>>
      // @ts-expect-error A probe work object cannot enter the capture planning path.
      void boundary.prepareCaptureRead({ workUnit: probeWork, requestId: 'request', requestInput: {} })
      // @ts-expect-error A capture work unit cannot enter the connection-probe planning path.
      void boundary.prepareConnectionProbeRead({ probeWork: captureWork, requestId: 'request', requestInput: {} })
      // @ts-expect-error The concrete capture adapter accepts only a capture work unit.
      void mexcReadonlyAdapter.prepareReadPlan({ workUnit: probeWork, requestId: 'request', requestInput: {} })
      // @ts-expect-error The concrete probe adapter accepts only a probe work object.
      void mexcReadonlyAdapter.prepareProbeReadPlan({ probeWork: captureWork, requestId: 'request', requestInput: {} })
    }
    expect(true).toBe(true)
  })

  it('registers only immutable versioned GET descriptors with exact descriptor digests', async () => {
    expect(MEXC_PROVIDER_CODE).toBe('mexc')
    expect(MEXC_PROVIDER_CONTRACT_VERSION).toBe('mexc_futures_contract_v1')
    expect(MEXC_ADAPTER_VERSION).toBe('v57_61_0_mb1')
    expect(Object.isFrozen(mexcReadonlyAdapter)).toBe(true)
    expect(Object.isFrozen(MEXC_READONLY_CAPABILITIES)).toBe(true)
    expect(MEXC_READONLY_CAPABILITIES).toHaveLength(5)
    for (const descriptor of MEXC_READONLY_CAPABILITIES) {
      expect(Object.isFrozen(descriptor)).toBe(true)
      expect(Object.isFrozen(descriptor.ref)).toBe(true)
      expect(descriptor.constantMethod).toBe('GET')
      expect(descriptor.constantHttpsOrigin).toBe(MEXC_API_ORIGIN)
      expect(descriptor.constantPort).toBe(443)
      expect(descriptor.mutationContract).toBe('mutations_forbidden')
      expect(descriptor.pageSequenceContractVersion).toBe(PAGE_SEQUENCE_CONTRACT_VERSION)
      expect(descriptor.ref.capabilityDescriptorDigest).toBe(descriptorDigest(executionContract(descriptor)))
      await expect(brokerCodeRegistry.readBuiltCapability(descriptor.ref)).resolves.toBe(descriptor)
      await expect(brokerCodeRegistry.readBuiltAdapter(descriptor.ref)).resolves.toBe(mexcReadonlyAdapter)
    }
    await expect(brokerCodeRegistry.readBuiltAdapter({
      ...MEXC_READONLY_CAPABILITIES[0].ref,
      adapterVersion: 'unregistered-version',
    } as any)).resolves.toBeNull()
  })

  it.each([
    ['contract_metadata_v1', { symbol: 'btc_usdt' }],
    ['historical_orders_v1', HISTORY_QUERY],
    ['historical_executions_v3', HISTORY_QUERY],
    ['historical_positions_v1', { ...HISTORY_QUERY, position_type: 1 }],
    ['funding_records_v1', { ...HISTORY_QUERY, position_type: 1, position_id: '000456' }],
  ] as const)('keeps %s request planning byte-semantically compatible with the legacy facade', (capabilityId, query) => {
    const descriptor = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === capabilityId)
    if (!descriptor) throw new Error('fixture descriptor missing')
    const legacy = prepareMexcRequest(capabilityId as MexcReadCapabilityId, query)
    const plan = mexcReadonlyAdapter.prepareReadPlan(captureInput(descriptor, query as unknown as CanonicalJsonValue))
    expect(plan).toMatchObject({
      method: 'GET',
      httpsOrigin: MEXC_API_ORIGIN,
      port: 443,
      pathTemplateId: legacy.path,
      canonicalPath: legacy.path,
      canonicalQuery: legacy.query,
      redirectMode: 'error',
      responseByteLimit: 64 * 1024,
      pageSequenceContractVersion: PAGE_SEQUENCE_CONTRACT_VERSION,
      pageSequence: 0,
    })
    expect(JSON.stringify(plan)).not.toMatch(/apiKey|secretKey|credential/i)
  })

  it('binds the complete stable capture query profile across pages before permit or egress can exist', async () => {
    const boundary = createBrokerRequestPlanningBoundary(brokerCodeRegistry)
    const orders = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === 'historical_orders_v1')!
    const positions = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === 'historical_positions_v1')!
    const funding = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === 'funding_records_v1')!
    const filteredOrdersQuery = { ...HISTORY_QUERY, states: [3, 1], category: 2 }
    const validOrders = captureInput(orders, filteredOrdersQuery as unknown as CanonicalJsonValue)
    const validPositions = captureInput(positions, { ...HISTORY_QUERY, position_type: 1 } as unknown as CanonicalJsonValue)
    const validFunding = captureInput(
      funding,
      { ...HISTORY_QUERY, position_type: 1, position_id: '000456' } as unknown as CanonicalJsonValue,
    )
    const plannedFirstPage = await boundary.prepareCaptureRead(validOrders as never)
    expect(plannedFirstPage).toMatchObject({
      plan: {
        canonicalQuery: prepareMexcRequest('historical_orders_v1', filteredOrdersQuery).query,
        pageSequenceContractVersion: PAGE_SEQUENCE_CONTRACT_VERSION,
        pageSequence: 0,
      },
    })

    const validSecondPage = {
      ...validOrders,
      requestInput: { ...filteredOrdersQuery, page_num: 2 },
      workUnit: {
        ...validOrders.workUnit,
        checkpoint: {
          ...validOrders.workUnit.checkpoint,
          payload: {
            ...validOrders.workUnit.checkpoint.payload as object,
            lastPageObservationId: 'page-observation-1',
            nextPageNumber: 2,
          },
        },
      },
    }
    const plannedSecondPage = await boundary.prepareCaptureRead(validSecondPage as never)
    expect(plannedSecondPage).toMatchObject({
      plan: {
        canonicalQuery: { page_num: '2', page_size: '20', states: '1,3', category: '2' },
        pageSequenceContractVersion: PAGE_SEQUENCE_CONTRACT_VERSION,
        pageSequence: 1,
      },
    })
    const firstPageTransition = {
      workUnit: validOrders.workUnit,
      wirePage: { execution: { plan: plannedFirstPage.plan } },
      inspectedPage: {
        pageBinding: {
          authorizationBinding: { requestBinding: { provider: orders.ref } },
          pageObservationId: 'page-observation-1',
          pageSequence: 0,
          completenessStatus: 'page_observed_scope_open',
        },
      },
    }
    const advancedCheckpoint = mexcReadonlyAdapter.advanceCheckpoint(firstPageTransition as never)
    expect(advancedCheckpoint.nextCheckpointPayload).toMatchObject({
      captureQueryProfileDigest: validOrders.workUnit.scope.captureQueryProfileDigest,
      nextPageNumber: 2,
      terminal: false,
    })
    expect(advancedCheckpoint.nextCaptureQueryProfileDigest)
      .toBe(validOrders.workUnit.scope.captureQueryProfileDigest)

    expect(() => mexcReadonlyAdapter.advanceCheckpoint({
      ...firstPageTransition,
      inspectedPage: {
        pageBinding: { ...firstPageTransition.inspectedPage.pageBinding, pageSequence: 1 },
      },
    } as never)).toThrow(/keine identische Seitensequenz/)
    expect(() => mexcReadonlyAdapter.advanceCheckpoint({
      ...firstPageTransition,
      wirePage: {
        execution: {
          plan: { ...plannedFirstPage.plan, pageSequence: 1 },
        },
      },
    } as never)).toThrow(/keine identische Seitensequenz/)
    expect(() => mexcReadonlyAdapter.advanceCheckpoint({
      ...firstPageTransition,
      workUnit: {
        ...validOrders.workUnit,
        checkpoint: {
          ...validOrders.workUnit.checkpoint,
          payload: { ...validOrders.workUnit.checkpoint.payload as object, nextPageNumber: 2 },
        },
      },
    } as never)).toThrow(/Page oder Capability stimmt nicht mit dem Checkpoint/)

    const secondPageTransition = {
      workUnit: validSecondPage.workUnit,
      wirePage: { execution: { plan: plannedSecondPage.plan } },
      inspectedPage: {
        pageBinding: {
          authorizationBinding: { requestBinding: { provider: orders.ref } },
          pageObservationId: 'page-observation-2',
          pageSequence: 1,
          completenessStatus: 'page_observed_scope_open',
        },
      },
    }
    expect(mexcReadonlyAdapter.advanceCheckpoint(secondPageTransition as never).nextCheckpointPayload).toMatchObject({
      nextPageNumber: 3,
      terminal: false,
    })
    expect(() => mexcReadonlyAdapter.advanceCheckpoint({
      ...secondPageTransition,
      inspectedPage: {
        pageBinding: { ...secondPageTransition.inspectedPage.pageBinding, pageSequence: 0 },
      },
    } as never)).toThrow(/keine identische Seitensequenz/)

    for (const completenessStatus of [
      'scope_complete_provider_claim_unverified',
      'partial_observation',
      'blocked_observation',
    ] as const) {
      const terminal = mexcReadonlyAdapter.advanceCheckpoint({
        ...firstPageTransition,
        inspectedPage: {
          pageBinding: { ...firstPageTransition.inspectedPage.pageBinding, completenessStatus },
        },
      } as never)
      expect(terminal.nextCheckpointPayload).toMatchObject({ nextPageNumber: 1, terminal: true })
      expect(terminal.status).not.toBe('next_page')
    }

    const fundingSecondPage = {
      ...validFunding,
      requestInput: { ...HISTORY_QUERY, position_type: 1, position_id: '000456', page_num: 2 },
      workUnit: {
        ...validFunding.workUnit,
        checkpoint: {
          ...validFunding.workUnit.checkpoint,
          payload: {
            ...validFunding.workUnit.checkpoint.payload as object,
            lastPageObservationId: 'funding-page-observation-1',
            nextPageNumber: 2,
          },
        },
      },
    }
    await expect(boundary.prepareCaptureRead(fundingSecondPage as never)).resolves.toBeDefined()

    const mismatches = [
      { ...validOrders, requestInput: { ...filteredOrdersQuery, symbol: 'ETH_USDT' } },
      { ...validOrders, requestInput: { ...filteredOrdersQuery, start_time: HISTORY_QUERY.start_time + 1 } },
      { ...validOrders, requestInput: { ...filteredOrdersQuery, end_time: HISTORY_QUERY.end_time - 1 } },
      { ...validOrders, requestInput: { ...filteredOrdersQuery, page_num: 2 } },
      { ...validSecondPage, requestInput: { ...filteredOrdersQuery, page_num: 2, page_size: 100 } },
      { ...validSecondPage, requestInput: { ...filteredOrdersQuery, page_num: 2, states: [1] } },
      { ...validSecondPage, requestInput: { ...HISTORY_QUERY, page_num: 2, category: 2 } },
      { ...validSecondPage, requestInput: { ...filteredOrdersQuery, page_num: 2, category: 3 } },
      { ...validOrders, requestInput: { ...filteredOrdersQuery, cursor: 'forbidden-cursor' } },
      { ...validPositions, requestInput: { ...HISTORY_QUERY, position_type: 2 } },
      { ...fundingSecondPage, requestInput: { ...HISTORY_QUERY, page_num: 2, position_type: 1, position_id: '457' } },
      {
        ...validOrders,
        workUnit: {
          ...validOrders.workUnit,
          checkpoint: {
            ...validOrders.workUnit.checkpoint,
            payload: { ...validOrders.workUnit.checkpoint.payload as object, nextPageNumber: 2 },
          },
        },
      },
      {
        ...validOrders,
        workUnit: {
          ...validOrders.workUnit,
          checkpoint: {
            ...validOrders.workUnit.checkpoint,
            payload: {
              ...validOrders.workUnit.checkpoint.payload as object,
              captureQueryProfileDigest: 'f'.repeat(64),
            },
          },
        },
      },
    ]
    for (const mismatch of mismatches) {
      await expect(boundary.prepareCaptureRead(mismatch as never)).rejects.toThrow()
    }

    const wrongScopeDigest = structuredClone(validOrders) as any
    wrongScopeDigest.workUnit.chainBinding.authority.purposeScopeDigest = 'wrong-scope-digest'
    wrongScopeDigest.workUnit.chainBinding.authority.authorityTupleDigest = computeAuthorityTupleDigest(
      wrongScopeDigest.workUnit.chainBinding.authority,
    )
    await expect(boundary.prepareCaptureRead(wrongScopeDigest)).rejects.toThrow(/work_unit_semantics_invalid/)
  })

  it('binds a secret-free probe setup command and rejects scope or shape drift before any egress exists', async () => {
    const descriptor = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === 'historical_orders_v1')!
    const fixture = await setupProbe(descriptor, HISTORY_QUERY as unknown as CanonicalJsonValue)
    const plan = (await createBrokerRequestPlanningBoundary(brokerCodeRegistry)
      .prepareConnectionProbeRead(fixture.input)).plan
    expect(plan.authorityPurpose).toBe('connection_probe')
    expect(plan.canonicalQuery).toEqual(prepareMexcRequest('historical_orders_v1', HISTORY_QUERY).query)
    expect(fixture.command).not.toHaveProperty('requestInput')
    expect(fixture.command).not.toHaveProperty('requestInputDigest')
    expect(JSON.stringify(fixture.command)).not.toContain('readonly-access-token')
    expect(fixture.command.canonicalDescriptorQueryDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(fixture.command.canonicalDescriptorQueryDigest)
      .not.toBe(computeCanonicalBrokerValueDigest(HISTORY_QUERY as unknown as CanonicalJsonValue))

    const equivalentFixture = await setupProbe(descriptor, {
      ...HISTORY_QUERY,
      symbol: '  btc_usdt  ',
    } as unknown as CanonicalJsonValue)
    expect(equivalentFixture.command.canonicalDescriptorQueryDigest)
      .toBe(fixture.command.canonicalDescriptorQueryDigest)

    const probeInput = fixture.input as any
    expect(() => mexcReadonlyAdapter.prepareProbeReadPlan({
      ...probeInput,
      requestInput: { ...HISTORY_QUERY, page_num: 2 },
    } as never)).toThrowError(MexcTransportError)
    expect(() => mexcReadonlyAdapter.prepareProbeReadPlan({
      ...probeInput,
      probeWork: {
        ...probeInput.probeWork,
        setupCommand: {
          ...fixture.command,
          requestInput: { nested: { accessToken: 'readonly-access-token' } },
        },
      },
    } as never)).toThrow(/connection_setup_command_shape_invalid/)

    const credentialLikeInput = {
      ...HISTORY_QUERY,
      accessToken: 'readonly-access-token',
    } as unknown as CanonicalJsonValue
    const forgedCommand = {
      ...fixture.command,
      canonicalDescriptorQueryDigest: computeCanonicalBrokerValueDigest(credentialLikeInput),
    }
    const forgedAuthority = {
      ...fixture.authority,
      setupRequestDigest: computeCanonicalBrokerValueDigest(forgedCommand as unknown as CanonicalJsonValue),
      authorityTupleDigest: '',
    }
    forgedAuthority.authorityTupleDigest = computeAuthorityTupleDigest(forgedAuthority as any)
    await expect(createBrokerRequestPlanningBoundary(brokerCodeRegistry).prepareConnectionSetupCommand({
      authority: forgedAuthority as any,
      requestInput: credentialLikeInput,
    })).rejects.toThrow(/code_registry_setup_query_rejected/)

    expect(() => mexcReadonlyAdapter.prepareProbeReadPlan({
      ...probeInput,
      probeWork: {
        ...probeInput.probeWork,
        setupCommand: {
          ...fixture.command,
          probeBudget: { ...fixture.command.probeBudget, responseByteLimit: 32 * 1024 },
        },
      },
    } as never)).toThrow(/connection_setup_command_authority_mismatch/)
  })

  it('creates the request binding and unsigned digest only inside the provider-neutral planning boundary', async () => {
    const descriptor = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === 'historical_orders_v1')!
    const fixture = await setupProbe(descriptor, HISTORY_QUERY as unknown as CanonicalJsonValue)
    const planned = await createBrokerRequestPlanningBoundary(brokerCodeRegistry)
      .prepareConnectionProbeRead(fixture.input)
    const digestInput = {
      authorityPurpose: planned.plan.authorityPurpose,
      authorityTupleDigest: planned.plan.authorityTupleDigest,
      provider: planned.plan.provider,
      method: planned.plan.method,
      httpsOrigin: planned.plan.httpsOrigin,
      port: planned.plan.port,
      pathTemplateId: planned.plan.pathTemplateId,
      canonicalPath: planned.plan.canonicalPath,
      canonicalQuery: planned.plan.canonicalQuery,
      redirectMode: planned.plan.redirectMode,
      responseByteLimit: planned.plan.responseByteLimit,
      requestTimeoutMs: planned.plan.requestTimeoutMs,
      planContractVersion: planned.plan.planContractVersion,
      pageSequenceContractVersion: planned.plan.pageSequenceContractVersion,
      pageSequence: planned.plan.pageSequence,
    }
    expect(planned.requestBinding.canonicalUnsignedRequestDigest)
      .toBe(computeCanonicalBrokerValueDigest(digestInput as unknown as CanonicalJsonValue))
    expect(planned.plan.canonicalUnsignedRequestDigest)
      .toBe(planned.requestBinding.canonicalUnsignedRequestDigest)
    expect(planned.plan.requestBinding).toEqual(planned.requestBinding)
    expect(Object.isFrozen(planned.plan)).toBe(true)
    expect(Object.isFrozen(planned.requestBinding)).toBe(true)
  })

  it('fails closed when the pinned adapter is absent from the code registry', async () => {
    const descriptor = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === 'historical_orders_v1')!
    const fixture = await setupProbe(descriptor, HISTORY_QUERY as unknown as CanonicalJsonValue)
    const emptyRegistry: BrokerCodeRegistryPort = Object.freeze({
      async readBuiltCapability() { return null },
      async readBuiltAdapter() { return null },
    })
    await expect(createBrokerRequestPlanningBoundary(emptyRegistry)
      .prepareConnectionProbeRead(fixture.input)).rejects.toThrow(/code_registry_descriptor_missing_or_mismatched/)
  })

  it.each([
    ['method', { method: 'POST' }],
    ['origin', { httpsOrigin: 'https://example.invalid' }],
    ['path', { canonicalPath: '/api/v1/private/order/submit' }],
    ['query', { canonicalQuery: { ...prepareMexcRequest('historical_orders_v1', HISTORY_QUERY).query, page_num: '01' } }],
    ['budget', { responseByteLimit: 128 * 1024 }],
  ] as const)('rejects a registered adapter draft with %s drift before permit or credential handling', async (_label, mutation) => {
    const descriptor = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === 'historical_orders_v1')!
    const fixture = await setupProbe(descriptor, HISTORY_QUERY as unknown as CanonicalJsonValue)
    const validDraft = mexcReadonlyAdapter.prepareProbeReadPlan(fixture.input)
    const driftedAdapter = Object.freeze({
      ...mexcReadonlyAdapter,
      prepareProbeReadPlan() {
        return Object.freeze({ ...validDraft, ...mutation })
      },
    }) as unknown as ReadOnlyBrokerAdapter
    const driftedRegistry: BrokerCodeRegistryPort = Object.freeze({
      async readBuiltCapability(ref: ProviderCapabilityRef) {
        return ref.capabilityDescriptorDigest === descriptor.ref.capabilityDescriptorDigest ? descriptor : null
      },
      async readBuiltAdapter() { return driftedAdapter },
    })
    await expect(createBrokerRequestPlanningBoundary(driftedRegistry)
      .prepareConnectionProbeRead(fixture.input)).rejects.toThrow()
  })

  it('keeps a successful signed probe sanitized and without capture or downstream authority', async () => {
    const descriptor = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === 'historical_orders_v1')!
    const fixture = await setupProbe(descriptor, HISTORY_QUERY as unknown as CanonicalJsonValue)
    const draft = mexcReadonlyAdapter.prepareProbeReadPlan(fixture.input)
    const rawBody = envelope([])
    const authorizationBinding = { requestAuthorityId: 'probe-authority-1', requestBinding: fixture.requestBinding }
    const wire = {
      execution: {
        requestBinding: fixture.requestBinding,
        authorizationBinding,
        plan: draft,
        capabilityContract: executionContract(descriptor),
      },
      wireResponse: {
        authorizationBinding,
        httpStatus: 200,
        rawBody: [...rawBody],
        receivedAt: '2026-08-16T21:00:00.000Z',
      },
    } as never
    const result = mexcReadonlyAdapter.inspectConnectionProbeWireResponse(wire)
    expect(result).toMatchObject({
      technicalReadResult: 'read_succeeded',
      permissionEvidenceResult: 'read_permission_observed',
      accountIdentityResult: 'not_observed',
      sanitizedFindings: ['account_identity_not_observed'],
      persistenceAuthority: 'sanitized_probe_receipt_only',
      captureAuthority: 'none',
      normalizationAuthority: 'none',
      reconciliationAuthority: 'none',
      approvalAuthority: 'none',
      importAuthority: 'none',
    })
    expect(JSON.stringify(result)).not.toMatch(/apiKey|secretKey|rawBody|payload/i)
  })

  it('maps an inspected order page only to provider-observed raw candidates', () => {
    const descriptor = MEXC_READONLY_CAPABILITIES.find((candidate) => candidate.ref.providerCapabilityId === 'historical_orders_v1')!
    const order = {
      orderId: '123', positionId: '456', symbol: 'BTC_USDT', side: 1, positionMode: 1, state: 3, category: 1, orderType: 1,
      vol: '2.5', dealVol: '2.5', price: '100.125', dealAvgPrice: '100.125', takerFee: '-0.01', makerFee: '0', profit: '1.5',
      feeCurrency: 'USDT', createTime: NOW - 2_000, updateTime: NOW - 1_000,
    }
    const data = canonicalizeMexcProviderPayload(parseMexcResponseEnvelope(envelope([order]), 200))
    const pageBinding = {
      authorizationBinding: { requestBinding: { provider: descriptor.ref } },
      pageObservationId: 'page-1',
      pageSequence: 1,
      observedAt: '2026-08-16T21:00:00.000Z',
      pagePayloadDigest: computeCanonicalBrokerValueDigest(data),
      completenessStatus: 'page_observed_scope_open',
    }
    const candidates = mexcReadonlyAdapter.mapRawEvents({
      pageBinding,
      responseContractVersion: descriptor.responseContractVersion,
      requestEvidence: {},
      pageEvidence: { pageBinding, pagePayload: data },
    } as never)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      pageBinding,
      eventKind: 'order',
      providerIdentity: { identityStatus: 'stable_provider_id', providerEventId: '123', blockedIdentity: null },
      providerRevision: null,
      providerOccurredAtUs: String(BigInt(NOW - 2_000) * BigInt(1_000)),
    })
    expect(candidates[0]).not.toHaveProperty('normalizationAuthority')
    expect(candidates[0]).not.toHaveProperty('reconciliationAuthority')
    expect(candidates[0]).not.toHaveProperty('importAuthority')
  })
})
