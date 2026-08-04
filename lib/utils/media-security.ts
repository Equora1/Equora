export const EQUORA_MEDIA_BUCKET = 'equora-media'
export const EQUORA_MEDIA_SIGNED_URL_TTL_SECONDS = 5 * 60

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isCanonicalOwnedPath(path: string, userId: string, kind: 'trades' | 'setups', parentId: string) {
  if (!path || path.includes('\\') || path.includes('//') || /%2e/i.test(path)) return false
  const prefix = `${escapeRegExp(userId)}/${kind}/${escapeRegExp(parentId)}/`
  return new RegExp(`^${prefix}[A-Za-z0-9][A-Za-z0-9._-]{0,199}$`).test(path)
}

export function isCanonicalOwnedMediaPathForUser(userId: string, path: string) {
  if (!userId || !path || path.includes('\\') || path.includes('//') || /%2e/i.test(path)) return false
  const prefix = escapeRegExp(userId)
  return new RegExp(`^${prefix}/(?:trades|setups)/[0-9a-fA-F-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$`).test(path)
}

export function assertOwnedTradeMediaPath(userId: string, tradeId: string, path: string) {
  if (!isCanonicalOwnedPath(path, userId, 'trades', tradeId)) {
    throw new Error('INVALID_MEDIA_PATH')
  }
}

export function assertOwnedSetupMediaPath(userId: string, setupId: string, path: string) {
  if (!isCanonicalOwnedPath(path, userId, 'setups', setupId)) {
    throw new Error('INVALID_MEDIA_PATH')
  }
}
