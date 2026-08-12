import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const LEGACY_KEY_VERSION = 'v1'
const KEY_BYTES = 32
const MAX_KEY_VERSIONS = 16
const KEY_VERSION_PATTERN = /^[a-z][a-z0-9_]{0,62}$/

export type StoredBrokerCredentials = Readonly<{
  apiKey: string
  secretKey: string
}>

type EncryptedEnvelope = Readonly<{
  v: string
  iv: string
  tag: string
  data: string
}>

function decodeKey(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const value = raw.trim()
  let key: Buffer
  try {
    key = /^[a-fA-F0-9]{64}$/.test(value)
      ? Buffer.from(value, 'hex')
      : Buffer.from(value, 'base64')
  } catch {
    return null
  }
  if (key.length !== KEY_BYTES) {
    key.fill(0)
    return null
  }
  return key
}

function clearKeys(keys: Map<string, Buffer>) {
  for (const key of keys.values()) key.fill(0)
  keys.clear()
}

function readKeyring() {
  const keys = new Map<string, Buffer>()
  const reject = () => {
    clearKeys(keys)
    return null
  }
  const serialized = process.env.EQUORA_BROKER_SECRET_KEYS?.trim()
  if (serialized) {
    let parsed: unknown
    try {
      parsed = JSON.parse(serialized)
    } catch {
      return reject()
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reject()
    const entries = Object.entries(parsed)
    if (!entries.length || entries.length > MAX_KEY_VERSIONS) return reject()
    for (const [version, raw] of entries) {
      const key = decodeKey(raw)
      if (!KEY_VERSION_PATTERN.test(version) || !key || keys.has(version)) {
        key?.fill(0)
        return reject()
      }
      keys.set(version, key)
    }
  }

  const legacy = decodeKey(process.env.EQUORA_BROKER_SECRET_KEY)
  if (legacy) {
    if (keys.has(LEGACY_KEY_VERSION)) legacy.fill(0)
    else keys.set(LEGACY_KEY_VERSION, legacy)
  }
  if (!keys.size) return reject()

  const activeVersion = process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION?.trim()
    || LEGACY_KEY_VERSION
  if (!KEY_VERSION_PATTERN.test(activeVersion) || !keys.has(activeVersion)) return reject()
  return Object.freeze({ keys, activeVersion })
}

function clearKeyring(keyring: NonNullable<ReturnType<typeof readKeyring>>) {
  clearKeys(keyring.keys)
}

function additionalData(version: string, userId: string, provider: string) {
  return Buffer.from(`equora:${version}:${provider.toLowerCase()}:${userId}`, 'utf8')
}

function parsedEnvelope(encryptedPayload: string): EncryptedEnvelope {
  let envelope: unknown
  try {
    envelope = JSON.parse(encryptedPayload)
  } catch {
    throw new Error('BROKER_SECRET_INVALID')
  }
  if (
    !envelope
    || typeof envelope !== 'object'
    || Array.isArray(envelope)
    || Object.keys(envelope).sort().join('|') !== 'data|iv|tag|v'
  ) throw new Error('BROKER_SECRET_INVALID')
  const value = envelope as Record<string, unknown>
  if (
    typeof value.v !== 'string'
    || !KEY_VERSION_PATTERN.test(value.v)
    || typeof value.iv !== 'string'
    || typeof value.tag !== 'string'
    || typeof value.data !== 'string'
  ) throw new Error('BROKER_SECRET_INVALID')
  return value as EncryptedEnvelope
}

export function hasBrokerSecretKey() {
  const keyring = readKeyring()
  if (!keyring) return false
  clearKeyring(keyring)
  return true
}

export function getActiveBrokerSecretKeyVersion() {
  const keyring = readKeyring()
  if (!keyring) throw new Error('BROKER_SECRET_KEY_MISSING')
  try {
    return keyring.activeVersion
  } finally {
    clearKeyring(keyring)
  }
}

export function encryptBrokerCredentials(
  credentials: StoredBrokerCredentials,
  userId: string,
  provider: string,
) {
  const keyring = readKeyring()
  if (!keyring) throw new Error('BROKER_SECRET_KEY_MISSING')
  let plaintext: Buffer | null = null
  try {
    const version = keyring.activeVersion
    const key = keyring.keys.get(version)!
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    cipher.setAAD(additionalData(version, userId, provider))
    plaintext = Buffer.from(JSON.stringify(credentials), 'utf8')
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return JSON.stringify({
      v: version,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    } satisfies EncryptedEnvelope)
  } finally {
    plaintext?.fill(0)
    clearKeyring(keyring)
  }
}

export function decryptBrokerCredentials(
  encryptedPayload: string,
  userId: string,
  provider: string,
  expectedKeyVersion?: string,
): StoredBrokerCredentials {
  const keyring = readKeyring()
  if (!keyring) throw new Error('BROKER_SECRET_KEY_MISSING')
  try {
    const envelope = parsedEnvelope(encryptedPayload)
    if (expectedKeyVersion !== undefined && envelope.v !== expectedKeyVersion) {
      throw new Error('BROKER_SECRET_KEY_VERSION_MISMATCH')
    }
    const key = keyring.keys.get(envelope.v)
    if (!key) throw new Error('BROKER_SECRET_KEY_VERSION_UNAVAILABLE')

    let iv: Buffer
    let tag: Buffer
    let data: Buffer
    try {
      iv = Buffer.from(envelope.iv, 'base64')
      tag = Buffer.from(envelope.tag, 'base64')
      data = Buffer.from(envelope.data, 'base64')
    } catch {
      throw new Error('BROKER_SECRET_INVALID')
    }
    if (iv.length !== 12 || tag.length !== 16 || !data.length) {
      throw new Error('BROKER_SECRET_INVALID')
    }

    let decrypted: Buffer
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv)
      decipher.setAAD(additionalData(envelope.v, userId, provider))
      decipher.setAuthTag(tag)
      decrypted = Buffer.concat([decipher.update(data), decipher.final()])
    } catch {
      throw new Error('BROKER_SECRET_INVALID')
    }

    try {
      const credentials = JSON.parse(
        decrypted.toString('utf8'),
      ) as Partial<StoredBrokerCredentials>
      if (
        typeof credentials.apiKey !== 'string'
        || !credentials.apiKey
        || typeof credentials.secretKey !== 'string'
        || !credentials.secretKey
      ) throw new Error('BROKER_SECRET_INVALID')
      return Object.freeze({ apiKey: credentials.apiKey, secretKey: credentials.secretKey })
    } catch (error) {
      if (error instanceof Error && error.message === 'BROKER_SECRET_INVALID') throw error
      throw new Error('BROKER_SECRET_INVALID')
    } finally {
      decrypted.fill(0)
    }
  } finally {
    clearKeyring(keyring)
  }
}
