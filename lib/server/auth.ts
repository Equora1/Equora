import { redirect } from 'next/navigation'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'

type BasicUser = {
  id: string
  email?: string | null
}

export async function getCurrentUser(): Promise<BasicUser | null> {
  if (!hasSupabaseClientEnv()) {
    return null
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user?.id) return null

    return {
      id: user.id,
      email: user.email ?? null,
    }
  } catch {
    return null
  }
}

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
