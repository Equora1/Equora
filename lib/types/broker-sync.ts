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
