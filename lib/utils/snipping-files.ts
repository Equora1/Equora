import type { SnippingSource } from '@/lib/utils/snipping-parser'

export type SnippingFileRole = 'settings' | 'chart'

function getExtension(file: File) {
  const fromName = file.name.match(/\.([a-z0-9]+)$/i)?.[1]
  if (fromName) return fromName.toLowerCase()
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/webp') return 'webp'
  return 'png'
}

export function renameSnippingFile(file: File, role: SnippingFileRole, source: SnippingSource = 'tradingview-position') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const prefix = source === 'tradingview-position' ? 'tradingview' : 'snipping'
  const roleLabel = role === 'settings' ? `${prefix}-settings` : `${prefix}-chart`
  return new File([file], `${roleLabel}-${timestamp}.${getExtension(file)}`, {
    type: file.type || 'image/png',
    lastModified: file.lastModified,
  })
}

function fallbackFingerprint(bytes: Uint8Array, file: File) {
  let hash = 2166136261
  const step = Math.max(1, Math.floor(bytes.length / 2048))
  for (let index = 0; index < bytes.length; index += step) {
    hash ^= bytes[index]
    hash = Math.imul(hash, 16777619)
  }
  return `${file.size}-${file.type}-${(hash >>> 0).toString(16)}`
}

export async function fingerprintSnippingFile(file: File) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  }
  return fallbackFingerprint(bytes, file)
}
