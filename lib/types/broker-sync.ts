export type BrokerPreviewKind = 'order' | 'execution'

export type BrokerProviderUiCode = 'mexc'

export type BrokerProviderPresentation = Readonly<{
  providerCode: BrokerProviderUiCode
  displayName: string
  marketLabel: string
  setupComponent: 'mexc_readonly_setup_v1'
  availability: 'built_in'
  readBoundary: string
}>

export const BROKER_PROVIDER_PRESENTATIONS: readonly BrokerProviderPresentation[] = Object.freeze([
  Object.freeze({
    providerCode: 'mexc',
    displayName: 'MEXC',
    marketLabel: 'Futures',
    setupComponent: 'mexc_readonly_setup_v1',
    availability: 'built_in',
    readBoundary: 'Fest definierte GET-only Lesecapabilities; kein Trading, Transfer oder automatischer Import.',
  }),
])

export type BrokerConnectionSummary = Readonly<{
  id: string
  providerCode: string
  accountLabel: string | null
  environment: 'live' | 'demo' | 'unknown'
  status: 'draft' | 'ready' | 'paused' | 'error' | 'revoked' | 'unknown'
  technicalReadResult: 'legacy_read_observed' | 'not_persisted'
  readOnlyAttestation: 'user_confirmed' | 'not_confirmed'
  permissionEvidence: 'limited_read_observed' | 'not_persisted'
  accountIdentityResult: 'pseudonymous_binding_present' | 'not_available'
  historyCoverage: 'capture_observed' | 'not_observed' | 'unavailable'
  lastCaptureAt: string | null
  hasSanitizedError: boolean
}>

const MEXC_CONNECTION_ACTION_STATUSES = new Set<BrokerConnectionSummary['status']>([
  'ready',
  'paused',
  'error',
])

export function findBrokerProviderPresentation(providerCode: string) {
  return BROKER_PROVIDER_PRESENTATIONS.find((provider) => provider.providerCode === providerCode) ?? null
}

export function canShowBrokerConnectionActions(connection: BrokerConnectionSummary) {
  return connection.providerCode === 'mexc'
    && connection.environment === 'live'
    && MEXC_CONNECTION_ACTION_STATUSES.has(connection.status)
}

export type BrokerPreviewItem = {
  id: string
  connectionId: string
  kind: BrokerPreviewKind
  symbol: string
  direction: string
  status: string
  price: number | null
  quantity: number | null
  fee: number | null
  profit: number | null
  occurredAt: string | null
  externalId: string | null
}

export type ConnectMexcInput = {
  accountLabel: string
  symbols: string
  apiKey: string
  secretKey: string
  readOnlyConfirmed: boolean
}

export type BrokerActionResult = {
  success: boolean
  message: string
  connectionId?: string
  preview?: BrokerPreviewItem[]
}

export type BrokerCaptureRunSummary = {
  id: string
  user_id: string
  broker_account_id: string
  sync_activation_id: string
  status: string
  trigger_kind: string
  lane_id: string
  started_at: string | null
  completed_at: string | null
  observed_event_count: number
  inserted_raw_event_count: number
  repeated_observation_count: number
  failed_request_count: number
  scope_count: number
  created_at: string
}
