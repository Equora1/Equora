type CookieEntry = { name: string; value: string }

function decodeJwtPayload(token: string) {
  const parts = token.split('.')
  if (parts.length < 2) return null

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = Buffer.from(padded, 'base64').toString('utf-8')
    return JSON.parse(json) as { sub?: string; email?: string }
  } catch {
    return null
  }
}

export function findSupabaseAuthCookie(cookies: CookieEntry[]) {
  return cookies.find((cookie) => cookie.name.includes('-auth-token')) ?? null
}

export function hasSupabaseAuthCookie(cookies: CookieEntry[]) {
  return !!findSupabaseAuthCookie(cookies)
}

export function readUserFromSupabaseAuthCookie(cookies: CookieEntry[]) {
  const cookie = findSupabaseAuthCookie(cookies)
  if (!cookie?.value) return null

  try {
    const parsed = JSON.parse(cookie.value) as { access_token?: string } | string
    const accessToken = typeof parsed === 'string' ? parsed : parsed?.access_token

    if (!accessToken) return null

    const payload = decodeJwtPayload(accessToken)
    if (!payload?.sub) return null

    return {
      id: payload.sub,
      email: payload.email ?? null,
      accessToken,
    }
  } catch {
    return null
  }
}

export function extractSupabaseSessionFromCookies(cookies: CookieEntry[]) {
  const user = readUserFromSupabaseAuthCookie(cookies)
  if (!user) return null

  return {
    access_token: user.accessToken,
    user: {
      id: user.id,
      email: user.email,
    },
  }
}
