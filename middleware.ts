import { NextResponse, type NextRequest } from 'next/server'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { updateSupabaseSession } from '@/lib/supabase/middleware'

const publicPaths = new Set(['/login'])

function redirectWithCookies(baseResponse: NextResponse, url: URL) {
  const redirectResponse = NextResponse.redirect(url)

  baseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie)
  })

  baseResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'location') return
    redirectResponse.headers.set(key, value)
  })

  redirectResponse.headers.set('Cache-Control', 'private, no-store')
  return redirectResponse
}

export async function middleware(request: NextRequest) {
  if (!hasSupabaseClientEnv()) {
    return NextResponse.next()
  }

  const pathname = request.nextUrl.pathname
  const isPublicPath = publicPaths.has(pathname)
  const bypassLoginRedirect = pathname === '/login' && request.nextUrl.searchParams.get('logged_out') === '1'
  const { response, user } = await updateSupabaseSession(request)

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return redirectWithCookies(response, url)
  }

  if (user && isPublicPath && !bypassLoginRedirect) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.searchParams.delete('next')
    return redirectWithCookies(response, url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
