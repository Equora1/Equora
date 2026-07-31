const FALLBACK_URL = 'https://example.supabase.co'
const FALLBACK_ANON_KEY = 'demo-key'
const FALLBACK_SERVICE_ROLE_KEY = 'demo-service-key'

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY
export const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE_ROLE_KEY

type SupabaseRuntimeStatus = {
  mode: 'supabase' | 'demo'
  missingClientEnv: string[]
  missingServerEnv: string[]
  warnings: string[]
}

function isRealValue(value: string, fallback: string) {
  return Boolean(value) && value !== fallback
}

export function hasSupabaseClientEnv() {
  return isRealValue(supabaseUrl, FALLBACK_URL) && isRealValue(supabaseAnonKey, FALLBACK_ANON_KEY)
}

export function hasSupabaseServerEnv() {
  return hasSupabaseClientEnv() && isRealValue(supabaseServiceRoleKey, FALLBACK_SERVICE_ROLE_KEY)
}

export function getSupabaseRuntimeStatus(): SupabaseRuntimeStatus {
  const missingClientEnv = [
    !isRealValue(supabaseUrl, FALLBACK_URL) ? 'NEXT_PUBLIC_SUPABASE_URL' : '',
    !isRealValue(supabaseAnonKey, FALLBACK_ANON_KEY) ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' : '',
  ].filter(Boolean)

  const missingServerEnv = [
    ...missingClientEnv,
    !isRealValue(supabaseServiceRoleKey, FALLBACK_SERVICE_ROLE_KEY) ? 'SUPABASE_SERVICE_ROLE_KEY' : '',
  ].filter(Boolean)

  const warnings = [
    missingClientEnv.length ? 'Client-Login, Sync und Storage laufen im Demo-Modus.' : '',
    !missingClientEnv.length && missingServerEnv.length ? 'Server-Aktionen ohne Service Role bleiben eingeschränkt.' : '',
  ].filter(Boolean)

  return {
    mode: missingClientEnv.length ? 'demo' : 'supabase',
    missingClientEnv,
    missingServerEnv,
    warnings,
  }
}
