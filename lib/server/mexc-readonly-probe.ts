import 'server-only'

import {
  executeMexcPrivateReadWorkUnit,
  type MexcCredentials,
  type MexcPrivateReadWorkUnit,
  type MexcTransportErrorCode,
} from '@/lib/server/mexc-transport'
import { MexcOracleError, validateMexcCapabilityData } from '@/lib/server/mexc-oracles'

export type MexcReadonlyProbeResult = Readonly<{
  status: 'capability_reads_succeeded'
  evidencePersistence: 'transient_not_persisted'
  oracleContractVersion: 'mexc-capability-oracle-v1'
  symbols: readonly string[]
  requestCount: number
  authorityBlocked: true
}>

export class MexcReadonlyProbeError extends Error {
  constructor(public readonly code: MexcTransportErrorCode) {
    super('MEXC Read-only-Evidenzlauf wurde abgelehnt.')
    this.name = 'MexcReadonlyProbeError'
  }
}

function requestsForSymbol(symbol: string, startTime: number, endTime: number) {
  const base = { symbol, start_time: startTime, end_time: endTime, page_num: 1, page_size: 10 }
  return Object.freeze([
    Object.freeze({ capabilityId: 'historical_orders_v1', query: Object.freeze(base) }),
    Object.freeze({ capabilityId: 'historical_executions_v3', query: Object.freeze(base) }),
    Object.freeze({ capabilityId: 'historical_positions_v1', query: Object.freeze({ ...base, position_type: 1 }) }),
    Object.freeze({ capabilityId: 'historical_positions_v1', query: Object.freeze({ ...base, position_type: 2 }) }),
    Object.freeze({ capabilityId: 'funding_records_v1', query: Object.freeze({ ...base, position_type: 1 }) }),
    Object.freeze({ capabilityId: 'funding_records_v1', query: Object.freeze({ ...base, position_type: 2 }) }),
  ] satisfies readonly MexcPrivateReadWorkUnit[])
}

export async function probeMexcReadonlyCredentials(
  credentials: MexcCredentials,
  symbols: readonly string[],
): Promise<MexcReadonlyProbeResult> {
  const endTime = Date.now()
  const startTime = endTime - 24 * 60 * 60 * 1_000
  let requestCount = 0
  for (const symbol of symbols) {
    const requests = requestsForSymbol(symbol, startTime, endTime)
    const result = await executeMexcPrivateReadWorkUnit(
      requests,
      () => credentials,
    )
    requestCount += result.outcomes.length
    for (const [index, request] of requests.entries()) {
      const outcome = result.outcomes[index]
      if (!outcome || outcome.capabilityId !== request.capabilityId) {
        throw new MexcReadonlyProbeError('malformed_response')
      }
      if (outcome.status === 'failed') throw new MexcReadonlyProbeError(outcome.error.code)
      const positionType = 'position_type' in request.query
        ? request.query.position_type
        : undefined
      try {
        validateMexcCapabilityData(request.capabilityId, outcome.response.data, {
          symbol,
          startTime,
          endTime,
          pageNumber: 1,
          pageSize: 10,
          ...(positionType === 1 || positionType === 2 ? { positionType } : {}),
        })
      } catch (error) {
        if (error instanceof MexcOracleError) {
          throw new MexcReadonlyProbeError('malformed_response')
        }
        throw error
      }
    }
  }
  return Object.freeze({
    status: 'capability_reads_succeeded',
    evidencePersistence: 'transient_not_persisted',
    oracleContractVersion: 'mexc-capability-oracle-v1',
    symbols: Object.freeze([...symbols]),
    requestCount,
    authorityBlocked: true,
  })
}
