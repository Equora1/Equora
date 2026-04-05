import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[], headers?: Record<string, string>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

        response = NextResponse.next({
          request,
        })

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })

        if (headers) {
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value)
          })
        }
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const user = data?.claims ?? null

  response.headers.set('Cache-Control', 'private, no-store')
  return { response, user }
}
