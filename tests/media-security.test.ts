import { describe, expect, it } from 'vitest'
import {
  assertOwnedSetupMediaPath,
  assertOwnedTradeMediaPath,
  EQUORA_MEDIA_SIGNED_URL_TTL_SECONDS,
  isCanonicalOwnedMediaPathForUser,
} from '../lib/utils/media-security'

const userId = '11111111-1111-4111-8111-111111111111'
const tradeId = '22222222-2222-4222-8222-222222222222'
const setupId = '33333333-3333-4333-8333-333333333333'

describe('private media path authorization', () => {
  it('accepts only the canonical owner/parent path', () => {
    const tradePath = `${userId}/trades/${tradeId}/chart-1.webp`
    const setupPath = `${userId}/setups/${setupId}/example_1.png`
    expect(() => assertOwnedTradeMediaPath(userId, tradeId, tradePath)).not.toThrow()
    expect(() => assertOwnedSetupMediaPath(userId, setupId, setupPath)).not.toThrow()
    expect(isCanonicalOwnedMediaPathForUser(userId, tradePath)).toBe(true)
  })

  it.each([
    `99999999-9999-4999-8999-999999999999/trades/${tradeId}/chart.png`,
    `${userId}/trades/${setupId}/chart.png`,
    `${userId}/trades/${tradeId}/../secret.png`,
    `${userId}/trades/${tradeId}/%2e%2e-secret.png`,
    `${userId}\\trades\\${tradeId}\\chart.png`,
    `${userId}/trades/${tradeId}//chart.png`,
    `https://example.test/${userId}/trades/${tradeId}/chart.png`,
  ])('rejects a non-canonical or foreign path: %s', (path) => {
    expect(() => assertOwnedTradeMediaPath(userId, tradeId, path)).toThrow('INVALID_MEDIA_PATH')
  })

  it('lets the cleanup worker recognize another canonical parent belonging to the same user', () => {
    expect(isCanonicalOwnedMediaPathForUser(userId, `${userId}/trades/${setupId}/chart.png`)).toBe(true)
  })

  it('keeps signed URLs short lived', () => {
    expect(EQUORA_MEDIA_SIGNED_URL_TTL_SECONDS).toBe(300)
  })
})
