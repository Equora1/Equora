import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_VERSION = 'v1'
const KEY_BYTES = 32

type StoredBrokerCredentials = {
  apiKey: string
  secretKey: string
}

type EncryptedEnvelope = {
  v: typeof KEY_VERSION
  iv: string
  tag: string
  data: string
}

function readEncryptionKey() {
  const raw = process.env.EQUORA_BROKER_SECRET_KEY?.trim()
  if (!raw) return null

  let key: Buffer
  if (/^[a-fA-F0-9]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else {
    key = Buffer.from(raw, 'base64')
  }

  return key.length === KEY_BYTES ? key : null
}

function additionalData(userId: string, provider: string) {
  return Buffer.from(`equora:${KEY_VERSION}:${provider.toLowerCase()}:${userId}`, 'utf8')
}

export function hasBrokerSecretKey() {
  return Boolean(readEncryptionKey())
}

export function encryptBrokerCredentials(
  credentials: StoredBrokerCredentials,
  userId: string,
  provider: string,
) {
  const key = readEncryptionKey()
  if (!key) {
    throw new Error('BROKER_SECRET_KEY_MISSING')
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(additionalData(userId, provider))

  const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const envelope: EncryptedEnvelope = {
    v: KEY_VERSION,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  }

  return JSON.stringify(envelope)
}

export function decryptBrokerCredentials(
  encryptedPayload: string,
  userId: string,
  provider: string,
): StoredBrokerCredentials {
  const key = readEncryptionKey()
  if (!key) {
    throw new Error('BROKER_SECRET_KEY_MISSING')
  }

  const envelope = JSON.parse(encryptedPayload) as Partial<EncryptedEnvelope>
  if (
    envelope.v !== KEY_VERSION
    || typeof envelope.iv !== 'string'
    || typeof envelope.tag !== 'string'
    || typeof envelope.data !== 'string'
  ) {
    throw new Error('BROKER_SECRET_INVALID')
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, 'base64'))
  decipher.setAAD(additionalData(userId, provider))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ])
  const credentials = JSON.parse(decrypted.toString('utf8')) as Partial<StoredBrokerCredentials>

  if (typeof credentials.apiKey !== 'string' || typeof credentials.secretKey !== 'string') {
    throw new Error('BROKER_SECRET_INVALID')
  }

  return {
    apiKey: credentials.apiKey,
    secretKey: credentials.secretKey,
  }
}
