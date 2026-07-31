import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { measurePerformance } from '@/lib/server/performance'

type BasicUser = {
  id: string
  email?: string | null
}

export const getCurrentUser = cache(async (): Promise<BasicUser | null> => {
  if (!hasSupabaseClientEnv()) return null

  return measurePerformance('auth.getClaims', 'auth', async () => {
    try {
      const supabase = await createSupabaseAuthServerClient()
      const { data, error } = await supabase.auth.getClaims()
      const claims = data?.claims
      const userId = typeof claims?.sub === 'string' ? claims.sub : null

      if (error || !userId) return null

      return {
        id: userId,
        email: typeof claims?.email === 'string' ? claims.email : null,
      }
    } catch {
      return null
    }
  })
})

export async function requireUser() {
  if (!hasSupabaseClientEnv()) {
    return null
  }

  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function getJournalAccess() {
  const user = await requireUser()
  return {
    mode: hasSupabaseClientEnv() ? ('supabase' as const) : ('demo' as const),
    user,
    userId: user?.id ?? 'demo-user',
  }
}
