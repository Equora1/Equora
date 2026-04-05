import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'

type AdminAwareUser = {
  id?: string | null
  email?: string | null
} | null | undefined

function parseAdminEmails(rawValue: string | undefined) {
  return (rawValue ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export function getEquoraAdminEmails() {
  return parseAdminEmails(process.env.EQUORA_ADMIN_EMAILS)
}

export function isEquoraAdminEmail(email?: string | null) {
  if (!email) return false
  return getEquoraAdminEmails().includes(email.trim().toLowerCase())
}

async function ensureEnvAdminMembership(user: AdminAwareUser) {
  const userId = user?.id ?? null
  const normalizedEmail = user?.email?.trim().toLowerCase() ?? null

  if (!userId || !normalizedEmail || !isEquoraAdminEmail(normalizedEmail) || !hasSupabaseServerEnv()) {
    return false
  }

  try {
    const supabase = createSupabaseServerClient()
    const timestamp = new Date().toISOString()
    const { error } = await supabase.from('admin_users').upsert(
      {
        user_id: userId,
        email: normalizedEmail,
        role: 'admin',
        is_active: true,
        updated_at: timestamp,
      },
      { onConflict: 'user_id' },
    )

    return !error
  } catch {
    return false
  }
}

export async function isEquoraAdminUser(user?: AdminAwareUser) {
  const userId = user?.id ?? null
  if (!userId) return false

  const fromEnv = await ensureEnvAdminMembership(user)
  if (fromEnv) return true

  if (!hasSupabaseClientEnv()) {
    return isEquoraAdminEmail(user?.email)
  }

  try {
    const supabase = hasSupabaseServerEnv() ? createSupabaseServerClient() : await createSupabaseAuthServerClient()
    const { data, error } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) return false
    return Boolean(data?.id)
  } catch {
    return false
  }
}
