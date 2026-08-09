import 'server-only'

import { createHmac } from 'node:crypto'
import type { BrokerAccountIdentityReference } from '@/lib/server/broker-raw-ledger'

const KEY_VERSION_PATTERN = /^[a-z][a-z0-9_]{0,62}$/
const KEY_BYTES_MIN = 32
const KEY_BYTES_MAX = 64

function decodeIdentityKey() {
  const raw = process.env.EQUORA_BROKER_IDENTITY_KEY?.trim()
  if (!raw) return null
  let key: Buffer
  try {
    key = /^[a-fA-F0-9]{64,128}$/.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64')
  } catch {
    return null
  }
  if (key.length < KEY_BYTES_MIN || key.length > KEY_BYTES_MAX) {
    key.fill(0)
    return null
  }
  return key
}

export function hasBrokerIdentityKey() {
  const version = process.env.EQUORA_BROKER_IDENTITY_KEY_VERSION?.trim() || 'idv1'
  if (!KEY_VERSION_PATTERN.test(version)) return false
  const key = decodeIdentityKey()
  if (!key) return false
  key.fill(0)
  return true
}

export function createMexcBrokerAccountIdentity(apiKey: string): BrokerAccountIdentityReference {
  const keyVersion = process.env.EQUORA_BROKER_IDENTITY_KEY_VERSION?.trim() || 'idv1'
  if (!KEY_VERSION_PATTERN.test(keyVersion)) throw new Error('BROKER_IDENTITY_KEY_MISSING')
  const key = decodeIdentityKey()
  if (!key) throw new Error('BROKER_IDENTITY_KEY_MISSING')
  try {
    const normalizedApiKey = apiKey.trim()
    if (!normalizedApiKey || normalizedApiKey.length > 256) throw new Error('BROKER_IDENTITY_INPUT_INVALID')
    const digest = createHmac('sha256', key)
      .update('equora:broker_account_identity_v1:mexc:live:')
      .update(normalizedApiKey)
      .digest('hex')
    return Object.freeze({
      digestAlgorithm: 'hmac-sha256',
      digestContractVersion: 'equora-tcj-v1',
      purpose: 'broker_account_identity_v1',
      keyVersion,
      digest,
      verificationStatus: 'unverified_reference',
    })
  } finally {
    key.fill(0)
  }
}
