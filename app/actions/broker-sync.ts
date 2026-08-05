'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { isMexcRuntimeActivated, MEXC_RUNTIME_BLOCK_MESSAGE } from '@/lib/server/mexc-runtime'
import type { BrokerActionResult, ConnectMexcInput } from '@/lib/types/broker-sync'

const MEXC_G1_NOT_IMPLEMENTED_MESSAGE = 'Der MEXC-Leseimport ist noch nicht aktivierungsreif. Die Runtime-Sperre bleibt geschlossen.'

export async function connectMexcBroker(_input: ConnectMexcInput): Promise<BrokerActionResult> {
  if (!isMexcRuntimeActivated()) return { success: false, message: MEXC_RUNTIME_BLOCK_MESSAGE }
  return { success: false, message: MEXC_G1_NOT_IMPLEMENTED_MESSAGE }
}

export async function refreshMexcPreview(_connectionId: string): Promise<BrokerActionResult> {
  if (!isMexcRuntimeActivated()) return { success: false, message: MEXC_RUNTIME_BLOCK_MESSAGE }
  return { success: false, message: MEXC_G1_NOT_IMPLEMENTED_MESSAGE }
}

export async function removeBrokerConnection(connectionId: string): Promise<BrokerActionResult> {
  const normalizedId = connectionId.trim()
  if (!normalizedId) return { success: false, message: 'Es wurde keine Verbindung ausgewählt.' }

  if (!hasSupabaseClientEnv()) return { success: false, message: 'Die Broker-Verbindung braucht eine konfigurierte Supabase-Umgebung.' }

  const authClient = await createSupabaseAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }

  const { error: deleteError } = await authClient.rpc('delete_own_broker_connection', { p_connection_id: normalizedId })
  if (deleteError) {
    const migrationMissing = deleteError.message.includes('PGRST202') || deleteError.message.toLowerCase().includes('schema cache')
    return {
      success: false,
      message: migrationMissing
        ? 'Die Datenbankmigration v57.60.1 fehlt. Verbindung und Credential wurden nicht verändert.'
        : 'Verbindung und verschlüsselter Zugang konnten nicht gemeinsam entfernt werden. Es wurde nichts teilweise gelöscht.',
    }
  }

  revalidatePath('/broker-sync')
  return { success: true, message: 'Die MEXC-Verbindung und der verschlüsselte Zugang wurden entfernt.' }
}
