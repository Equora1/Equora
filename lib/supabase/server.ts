import { createClient } from '@supabase/supabase-js'
import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/supabase/config'

export function createSupabaseServerClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey)
}
