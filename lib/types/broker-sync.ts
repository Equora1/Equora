export type BrokerPreviewKind = 'order' | 'execution'

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
