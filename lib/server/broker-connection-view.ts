import 'server-only'

import type {
  BrokerCaptureRunSummary,
  BrokerConnectionSummary,
} from '@/lib/types/broker-sync'
import type { BrokerConnectionRow } from '@/lib/types/db'

type BrokerConnectionProjectionRow = Pick<
  BrokerConnectionRow,
  | 'id'
  | 'provider'
  | 'account_label'
  | 'environment'
  | 'status'
  | 'permissions'
  | 'last_error'
>

type CaptureRunProjection = Pick<
  BrokerCaptureRunSummary,
  'sync_activation_id' | 'status' | 'completed_at'
>

export type BrokerCaptureEvidence = Readonly<
  | { state: 'capture_observed'; lastCaptureAt: string }
  | { state: 'not_observed' | 'unavailable'; lastCaptureAt: null }
>

export type CountedKeysetPage<T> = Readonly<{
  data: readonly T[] | null
  count: number | null
  error: Readonly<{ message: string; code?: string }> | null
}>

export type CompleteKeysetRead<T> = Readonly<{
  rows: readonly T[]
  error: Readonly<{ message: string; code?: string }> | null
  complete: boolean
  pageCount: number
}>

type BrokerReadError = Readonly<{
  code?: string | null
}>

const MISSING_BROKER_SCHEMA_CODES = new Set([
  '42P01', // PostgreSQL undefined_table
  '42703', // PostgreSQL undefined_column
  'PGRST204', // PostgREST column missing from the schema cache
  'PGRST205', // PostgREST table missing from the schema cache
])

const NO_CAPTURE_OBSERVED = Object.freeze({
  state: 'not_observed',
  lastCaptureAt: null,
}) satisfies BrokerCaptureEvidence

const PROVIDER_CODE_PATTERN = /^[a-z][a-z0-9_]{0,31}$/
const KNOWN_STATUSES = new Set(['draft', 'ready', 'paused', 'error', 'revoked'])
const LEGACY_TECHNICAL_READ_FLAGS = new Set([
  'historical_orders_read_observed',
  'historical_executions_read_observed',
])

export function isMissingBrokerSchemaError(error?: BrokerReadError | null) {
  const code = error?.code?.trim().toUpperCase() ?? ''
  return MISSING_BROKER_SCHEMA_CODES.has(code)
}

function keysetFailure<T>(message: string, code: string, pageCount: number): CompleteKeysetRead<T> {
  return Object.freeze({
    rows: [],
    error: Object.freeze({ message, code }),
    complete: false,
    pageCount,
  })
}

export async function readAllCountedKeysetPages<T extends Readonly<{ id: string }>>(
  readPage: (afterId: string | null) => Promise<CountedKeysetPage<T>>,
  options: Readonly<{ pageSize: number; maxPages: number }>,
): Promise<CompleteKeysetRead<T>> {
  if (!Number.isInteger(options.pageSize) || options.pageSize <= 0
    || !Number.isInteger(options.maxPages) || options.maxPages <= 0) {
    throw new Error('invalid counted keyset pagination limits')
  }

  const rows: T[] = []
  let initialPageIds: string[] | null = null
  let afterId: string | null = null
  let expectedRemaining: number | null = null

  for (let pageIndex = 0; pageIndex < options.maxPages; pageIndex += 1) {
    const response = await readPage(afterId)
    if (response.error) {
      return Object.freeze({ rows: [], error: response.error, complete: false, pageCount: pageIndex + 1 })
    }
    if (!Array.isArray(response.data)
      || !Number.isInteger(response.count)
      || response.count === null
      || response.count < 0) {
      return keysetFailure('Historical relation pagination did not return an exact count.', 'MB4_PAGINATION_COUNT_INVALID', pageIndex + 1)
    }

    if (expectedRemaining === null) expectedRemaining = response.count
    if (response.count !== expectedRemaining) {
      return keysetFailure('Historical relation rows changed while they were paginated.', 'MB4_PAGINATION_DRIFT', pageIndex + 1)
    }
    if (response.data.length > options.pageSize || response.data.length > expectedRemaining) {
      return keysetFailure('Historical relation page exceeded its declared bounds.', 'MB4_PAGINATION_PAGE_INVALID', pageIndex + 1)
    }
    if (initialPageIds === null) initialPageIds = response.data.map((row) => row.id)

    let previousId: string | null = afterId
    for (const row of response.data) {
      if (typeof row.id !== 'string' || row.id.length === 0 || (previousId !== null && row.id <= previousId)) {
        return keysetFailure('Historical relation page was not strictly ordered by immutable id.', 'MB4_PAGINATION_ORDER_INVALID', pageIndex + 1)
      }
      previousId = row.id
      rows.push(row)
    }
    expectedRemaining -= response.data.length

    if (expectedRemaining === 0) {
      const verification = await readPage(null)
      const firstPage = verification.data
      const verifiedInitialPageIds = initialPageIds ?? []
      if (verification.error
        || !Array.isArray(firstPage)
        || verification.count !== rows.length
        || firstPage.length !== verifiedInitialPageIds.length
        || firstPage.some((row, index) => row.id !== verifiedInitialPageIds[index])) {
        return keysetFailure('Historical relation completeness changed before final verification.', 'MB4_PAGINATION_FINAL_DRIFT', pageIndex + 2)
      }
      return Object.freeze({ rows, error: null, complete: true, pageCount: pageIndex + 2 })
    }
    if (response.data.length === 0 || previousId === afterId) {
      return keysetFailure('Historical relation pagination stopped before the exact count was reached.', 'MB4_PAGINATION_TRUNCATED', pageIndex + 1)
    }
    afterId = previousId
  }

  return keysetFailure('Historical relation pagination exceeded its bounded page budget.', 'MB4_PAGINATION_LIMIT', options.maxPages)
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  task: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) throw new Error('invalid concurrency limit')
  if (values.length === 0) return []

  const results = new Array<R>(values.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await task(values[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function providerCode(value: string) {
  const normalized = value.trim().toLowerCase()
  return PROVIDER_CODE_PATTERN.test(normalized) ? normalized : 'unknown'
}

function environment(value: string): BrokerConnectionSummary['environment'] {
  return value === 'live' || value === 'demo' ? value : 'unknown'
}

function status(value: string): BrokerConnectionSummary['status'] {
  return KNOWN_STATUSES.has(value) ? value as BrokerConnectionSummary['status'] : 'unknown'
}

export function projectBrokerConnectionSummary(
  row: BrokerConnectionProjectionRow,
  hasAccountBinding: boolean,
  captureEvidence: BrokerCaptureEvidence = NO_CAPTURE_OBSERVED,
): BrokerConnectionSummary {
  const permissions = new Set(Array.isArray(row.permissions) ? row.permissions : [])
  const technicalReadObserved = [...LEGACY_TECHNICAL_READ_FLAGS]
    .some((permission) => permissions.has(permission))
  const accountLabel = row.account_label?.trim() || null

  return Object.freeze({
    id: row.id,
    providerCode: providerCode(row.provider),
    accountLabel: accountLabel ? accountLabel.slice(0, 60) : null,
    environment: environment(row.environment),
    status: status(row.status),
    technicalReadResult: technicalReadObserved ? 'legacy_read_observed' : 'not_persisted',
    readOnlyAttestation: permissions.has('read_only_user_attested') ? 'user_confirmed' : 'not_confirmed',
    permissionEvidence: technicalReadObserved ? 'limited_read_observed' : 'not_persisted',
    accountIdentityResult: hasAccountBinding ? 'pseudonymous_binding_present' : 'not_available',
    historyCoverage: captureEvidence.state,
    lastCaptureAt: captureEvidence.lastCaptureAt,
    hasSanitizedError: Boolean(row.last_error),
  })
}

export function latestCaptureByConnection(
  runs: readonly CaptureRunProjection[],
  connectionIdByActivation: ReadonlyMap<string, string>,
) {
  const result = new Map<string, string>()

  for (const run of runs) {
    if (run.status !== 'completed' && run.status !== 'partial') continue
    if (!run.completed_at || Number.isNaN(Date.parse(run.completed_at))) continue
    const connectionId = connectionIdByActivation.get(run.sync_activation_id)
    if (!connectionId) continue
    const current = result.get(connectionId)
    if (!current || Date.parse(run.completed_at) > Date.parse(current)) {
      result.set(connectionId, run.completed_at)
    }
  }

  return result
}
