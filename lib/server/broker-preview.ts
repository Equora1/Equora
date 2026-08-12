import 'server-only'

import { createHash } from 'node:crypto'
import type { BrokerPreviewItem, BrokerPreviewKind } from '@/lib/types/broker-sync'
import type { BrokerRawEventRow } from '@/lib/types/db'
import { getMexcRecordId, type MexcReadResult } from '@/lib/server/mexc-readonly'

type JsonRecord = Record<string, unknown>

export type PendingRawEvent = {
  provider: 'mexc'
  eventType: BrokerPreviewKind
  externalEventId: string
  eventFingerprint: string
  occurredAt: string | null
  payload: JsonRecord
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function stringValue(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isoTime(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return isoTime(numeric)
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return null
}

function directionLabel(value: unknown) {
  const side = Number(value)
  const labels: Record<number, string> = {
    1: 'Long eröffnet',
    2: 'Short geschlossen',
    3: 'Short eröffnet',
    4: 'Long geschlossen',
  }
  return labels[side] ?? 'Richtung offen'
}

function orderStatusLabel(value: unknown) {
  const status = Number(value)
  const labels: Record<number, string> = {
    1: 'Übermittelt',
    2: 'Teilweise ausgeführt',
    3: 'Ausgeführt',
    4: 'Storniert',
    5: 'Ungültig',
  }
  return labels[status] ?? 'Status offen'
}

function eventTime(payload: JsonRecord) {
  return isoTime(payload.timestamp ?? payload.updateTime ?? payload.createTime)
}

function eventFingerprint(kind: BrokerPreviewKind, externalEventId: string, payload: JsonRecord) {
  const stableParts = [
    'mexc',
    kind,
    externalEventId,
    stringValue(payload.symbol),
    stringValue(payload.timestamp ?? payload.updateTime ?? payload.createTime),
    stringValue(payload.price ?? payload.dealAvgPrice),
    stringValue(payload.vol ?? payload.dealVol),
  ].join('|')
  return createHash('sha256').update(stableParts).digest('hex')
}

export function buildMexcRawEvents(result: MexcReadResult): PendingRawEvent[] {
  const orderEvents = result.orders.map((payload) => {
    const externalEventId = getMexcRecordId(payload, 'order')
    return {
      provider: 'mexc' as const,
      eventType: 'order' as const,
      externalEventId,
      eventFingerprint: eventFingerprint('order', externalEventId, payload),
      occurredAt: eventTime(payload),
      payload,
    }
  })

  const executionEvents = result.executions.map((payload) => {
    const externalEventId = getMexcRecordId(payload, 'execution')
    return {
      provider: 'mexc' as const,
      eventType: 'execution' as const,
      externalEventId,
      eventFingerprint: eventFingerprint('execution', externalEventId, payload),
      occurredAt: eventTime(payload),
      payload,
    }
  })

  return [...orderEvents, ...executionEvents]
}

export function mapRawEventToPreview(row: Pick<BrokerRawEventRow, 'id' | 'connection_id' | 'event_type' | 'external_event_id' | 'occurred_at' | 'payload'>): BrokerPreviewItem {
  const payload = asRecord(row.payload)
  if (row.event_type !== 'order' && row.event_type !== 'execution') {
    throw new Error('BROKER_PREVIEW_EVENT_TYPE_UNSUPPORTED')
  }
  const kind: BrokerPreviewKind = row.event_type

  return {
    id: row.id,
    connectionId: row.connection_id,
    kind,
    symbol: stringValue(payload.symbol) || 'Unbekannt',
    direction: directionLabel(payload.side),
    status: kind === 'execution' ? 'Ausgeführt' : orderStatusLabel(payload.state),
    price: numberValue(kind === 'execution' ? payload.price : payload.dealAvgPrice ?? payload.price),
    quantity: numberValue(kind === 'execution' ? payload.vol : payload.dealVol ?? payload.vol),
    fee: numberValue(kind === 'execution' ? payload.fee : (numberValue(payload.takerFee) ?? 0) + (numberValue(payload.makerFee) ?? 0)),
    profit: numberValue(payload.profit),
    occurredAt: row.occurred_at ?? eventTime(payload),
    externalId: row.external_event_id,
  }
}

export function mapCaptureRawEventToPreview(row: Readonly<{
  id: string
  broker_account_id: string
  event_type: string
  external_event_id: string | null
  provider_occurred_at_us: number | string | null
  raw_payload: unknown
}>, connectionId: string): BrokerPreviewItem {
  return mapRawEventToPreview({
    id: row.id,
    connection_id: connectionId,
    event_type: row.event_type,
    external_event_id: row.external_event_id,
    occurred_at: row.provider_occurred_at_us === null
      ? null
      : new Date(Math.floor(Number(row.provider_occurred_at_us) / 1_000)).toISOString(),
    payload: asRecord(row.raw_payload),
  })
}
