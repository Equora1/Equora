import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  mapCaptureRawEventToPreview,
  mapRawEventToPreview,
} from '../lib/server/broker-preview'

describe('broker preview event boundary', () => {
  it.each(['position', 'funding', 'account_financial_event', 'contract_metadata'])(
    'rejects %s instead of mislabelling it as an order',
    (eventType) => {
      expect(() => mapRawEventToPreview({
        id: '10000000-0000-4000-8000-000000000001',
        connection_id: '20000000-0000-4000-8000-000000000002',
        event_type: eventType,
        external_event_id: 'external-1',
        occurred_at: null,
        payload: {},
      } as never)).toThrowError('BROKER_PREVIEW_EVENT_TYPE_UNSUPPORTED')
    },
  )

  it('maps a current capture execution and converts provider microseconds', () => {
    expect(mapCaptureRawEventToPreview({
      id: '10000000-0000-4000-8000-000000000001',
      broker_account_id: '30000000-0000-4000-8000-000000000003',
      event_type: 'execution',
      external_event_id: 'deal-1',
      provider_occurred_at_us: '1760000000000000',
      raw_payload: { symbol: 'BTC_USDT', side: 1, price: '123.45', vol: '2' },
    }, '20000000-0000-4000-8000-000000000002')).toMatchObject({
      kind: 'execution',
      connectionId: '20000000-0000-4000-8000-000000000002',
      occurredAt: '2025-10-09T08:53:20.000Z',
      price: 123.45,
      quantity: 2,
    })
  })
})
