import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'

function isSupabaseAuthCookie(name: string) {
  return name.startsWith('sb-') || name.startsWith('__Secure-sb-')
}

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const authCookieNames = cookieStore.getAll().map(({ name }) => name).filter(isSupabaseAuthCookie)

  if (hasSupabaseClientEnv()) {
    const supabase = await createSupabaseAuthServerClient()
    await supabase.auth.signOut()
  }

  const url = new URL('/login?logged_out=1', request.url)
  const response = NextResponse.redirect(url)

  for (const name of authCookieNames) {
    response.cookies.set({
      name,
      value: '',
      expires: new Date(0),
      path: '/',
      secure: true,
      sameSite: 'lax',
    })
  }

  response.headers.set('Cache-Control', 'private, no-store')
  revalidatePath('/', 'layout')
  return response
}
