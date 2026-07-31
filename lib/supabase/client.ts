import { createBrowserClient } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }

  return browserClient
}
