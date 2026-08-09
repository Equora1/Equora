import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  decryptBrokerCredentials,
  encryptBrokerCredentials,
  getActiveBrokerSecretKeyVersion,
  hasBrokerSecretKey,
} from '../lib/server/broker-secret-store'
import {
  createMexcBrokerAccountIdentity,
  hasBrokerIdentityKey,
} from '../lib/server/broker-account-identity'

const ENV_KEYS = [
  'EQUORA_BROKER_SECRET_KEY',
  'EQUORA_BROKER_SECRET_KEYS',
  'EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION',
  'EQUORA_BROKER_IDENTITY_KEY',
  'EQUORA_BROKER_IDENTITY_KEY_VERSION',
  'EQUORA_MEXC_RUNTIME_MODE',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
const key = (byte: number) => Buffer.alloc(32, byte).toString('base64')

afterEach(() => {
  for (const envKey of ENV_KEYS) {
    const value = original[envKey]
    if (value === undefined) delete process.env[envKey]
    else process.env[envKey] = value
  }
  vi.resetModules()
})

describe('deployment credential and runtime boundary', () => {
  it('encrypts with the active version and decrypts an older retained version', () => {
    delete process.env.EQUORA_BROKER_SECRET_KEY
    process.env.EQUORA_BROKER_SECRET_KEYS = JSON.stringify({ oldv1: key(1), activev2: key(2) })
    process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION = 'oldv1'
    const oldEnvelope = encryptBrokerCredentials(
      { apiKey: 'read-api-key', secretKey: 'read-secret-key' },
      '00000000-0000-4000-a000-000000000001',
      'mexc',
    )

    process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION = 'activev2'
    expect(hasBrokerSecretKey()).toBe(true)
    expect(getActiveBrokerSecretKeyVersion()).toBe('activev2')
    expect(decryptBrokerCredentials(
      oldEnvelope,
      '00000000-0000-4000-a000-000000000001',
      'mexc',
      'oldv1',
    )).toEqual({ apiKey: 'read-api-key', secretKey: 'read-secret-key' })
  })

  it('fails closed for AAD drift, version drift and ciphertext tampering', () => {
    process.env.EQUORA_BROKER_SECRET_KEYS = JSON.stringify({ activev2: key(3) })
    process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION = 'activev2'
    const envelope = encryptBrokerCredentials(
      { apiKey: 'read-api-key', secretKey: 'read-secret-key' },
      '00000000-0000-4000-a000-000000000001',
      'mexc',
    )
    expect(() => decryptBrokerCredentials(
      envelope,
      '00000000-0000-4000-a000-000000000002',
      'mexc',
      'activev2',
    )).toThrow('BROKER_SECRET_INVALID')
    expect(() => decryptBrokerCredentials(
      envelope,
      '00000000-0000-4000-a000-000000000001',
      'mexc',
      'wrongv3',
    )).toThrow('BROKER_SECRET_KEY_VERSION_MISMATCH')
    const parsed = JSON.parse(envelope) as Record<string, string>
    parsed.data = `${parsed.data.slice(0, -2)}AA`
    expect(() => decryptBrokerCredentials(
      JSON.stringify(parsed),
      '00000000-0000-4000-a000-000000000001',
      'mexc',
    )).toThrow('BROKER_SECRET_INVALID')
  })

  it('supports the legacy v1 key only as an explicit compatibility path', () => {
    delete process.env.EQUORA_BROKER_SECRET_KEYS
    delete process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION
    process.env.EQUORA_BROKER_SECRET_KEY = key(4)
    expect(hasBrokerSecretKey()).toBe(true)
    expect(getActiveBrokerSecretKeyVersion()).toBe('v1')
  })

  it('derives stable pseudonymous MEXC account identities without retaining the API key', () => {
    process.env.EQUORA_BROKER_IDENTITY_KEY = key(5)
    process.env.EQUORA_BROKER_IDENTITY_KEY_VERSION = 'idv2'
    expect(hasBrokerIdentityKey()).toBe(true)
    const first = createMexcBrokerAccountIdentity('  read-api-key  ')
    const second = createMexcBrokerAccountIdentity('read-api-key')
    expect(first).toEqual(second)
    expect(first.keyVersion).toBe('idv2')
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(first)).not.toContain('read-api-key')
  })

  it('keeps capture default-off and requires the complete server environment', async () => {
    delete process.env.EQUORA_MEXC_RUNTIME_MODE
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-real'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-real'
    process.env.EQUORA_BROKER_SECRET_KEYS = JSON.stringify({ activev2: key(6) })
    process.env.EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION = 'activev2'
    process.env.EQUORA_BROKER_IDENTITY_KEY = key(7)
    process.env.EQUORA_BROKER_IDENTITY_KEY_VERSION = 'idv1'
    vi.resetModules()
    const runtime = await import('../lib/server/mexc-runtime')
    expect(runtime.getMexcRuntimeMode()).toBe('off')
    expect(runtime.isMexcRuntimeActivated()).toBe(false)
    expect(runtime.isMexcAutomaticCaptureActivated()).toBe(false)
    expect(runtime.isMexcCaptureEnvironmentReady()).toBe(true)
    process.env.EQUORA_MEXC_RUNTIME_MODE = 'capture'
    expect(runtime.isMexcAutomaticCaptureActivated()).toBe(true)
    delete process.env.EQUORA_BROKER_IDENTITY_KEY
    expect(runtime.isMexcCaptureEnvironmentReady()).toBe(false)
  })
})
