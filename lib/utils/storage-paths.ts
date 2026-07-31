export function getSetupImagePath(filename: string) { return `/setup-images/${filename}` }
export function getTradeScreenshotPath(filename: string) { return `/trade-screenshots/${filename}` }

function sanitizeFilename(filename: string) {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'screenshot.png'
}

export function getSupabaseTradeScreenshotPath(userId: string, tradeId: string, filename: string) {
  const safeName = sanitizeFilename(filename)
  return `${userId}/trades/${tradeId}/${Date.now()}-${safeName}`
}

export function getSupabaseSetupImagePath(userId: string, setupId: string, filename: string) {
  const safeName = sanitizeFilename(filename)
  return `${userId}/setups/${setupId}/${Date.now()}-${safeName}`
}
