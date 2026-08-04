'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import {
  decryptBrokerCredentials,
  encryptBrokerCredentials,
  hasBrokerSecretKey,
} from '@/lib/server/broker-secret-store'
import { buildMexcRawEvents } from '@/lib/server/broker-preview'
import { MexcReadError, readMexcFuturesPreview, type MexcReadResult } from '@/lib/server/mexc-readonly'
import type { BrokerActionResult, ConnectMexcInput } from '@/lib/types/broker-sync'

type ServiceClient = ReturnType<typeof createSupabaseServerClient>

type StoredConnection = {
  id: string
  provider: string
  credential_reference: string | null
}

type StoredCredential = {
  id: string
  encrypted_payload: string
}

function cleanText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function validateCredentials(apiKey: string, secretKey: string) {
  if (apiKey.length < 8 || apiKey.length > 256) {
    return 'Bitte einen gültigen MEXC API-Schlüssel eingeben.'
  }
  if (secretKey.length < 8 || secretKey.length > 256) {
    return 'Bitte den zugehörigen MEXC Secret Key eingeben.'
  }
  return null
}

async function currentUser() {
  const authClient = await createSupabaseAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

function serverRuntimeProblem(): string | null {
  if (!hasSupabaseClientEnv() || !hasSupabaseServerEnv()) {
    return 'Die sichere Broker-Verbindung braucht die Supabase-Servervariablen. Bitte zuerst die Vercel-Umgebung prüfen.'
  }
  return null
}

function connectorRuntimeProblem(): string | null {
  const serverProblem = serverRuntimeProblem()
  if (serverProblem) return serverProblem
  if (!hasBrokerSecretKey()) {
    return 'Der Verschlüsselungsschlüssel für Broker-Zugänge fehlt. Bitte EQUORA_BROKER_SECRET_KEY in Vercel hinterlegen.'
  }
  return null
}

async function persistMexcPreview(
  supabase: ServiceClient,
  userId: string,
  connectionId: string,
  result: MexcReadResult,
) {
  const events = buildMexcRawEvents(result)
  const { data: runData, error: runError } = await supabase
    .from('broker_sync_runs')
    .insert({
      user_id: userId,
      connection_id: connectionId,
      status: 'running',
      started_at: new Date().toISOString(),
      fetched_count: events.length,
      imported_count: 0,
      duplicate_count: 0,
      skipped_count: 0,
      error_count: 0,
      summary: {
        preview_only: true,
        orders: result.orders.length,
        executions: result.executions.length,
      },
    })
    .select('id')
    .single()

  if (runError || !runData) {
    return { warning: 'Die Verbindung funktioniert, aber die Prüfung konnte nicht im Verlauf gespeichert werden.' }
  }

  const runId = String(runData.id)
  const fingerprints = events.map((event) => event.eventFingerprint)
  let duplicateCount = 0
  let newEvents = events

  if (fingerprints.length) {
    const { data: existingData } = await supabase
      .from('broker_raw_events')
      .select('event_fingerprint')
      .eq('connection_id', connectionId)
      .in('event_fingerprint', fingerprints)

    const existing = new Set((existingData ?? []).map((row: { event_fingerprint: unknown }) => String(row.event_fingerprint)))
    duplicateCount = existing.size
    newEvents = events.filter((event) => !existing.has(event.eventFingerprint))
  }

  let storageError = false
  if (newEvents.length) {
    const { error } = await supabase.from('broker_raw_events').insert(newEvents.map((event) => ({
      user_id: userId,
      connection_id: connectionId,
      sync_run_id: runId,
      provider: event.provider,
      event_type: event.eventType,
      external_event_id: event.externalEventId,
      event_fingerprint: event.eventFingerprint,
      occurred_at: event.occurredAt,
      payload: event.payload,
      import_status: 'pending',
    })))
    storageError = Boolean(error)
  }

  const finishedAt = new Date().toISOString()
  await Promise.all([
    supabase
      .from('broker_sync_runs')
      .update({
        status: storageError ? 'partial' : 'completed',
        finished_at: finishedAt,
        duplicate_count: duplicateCount,
        error_count: storageError ? 1 : 0,
      })
      .eq('id', runId)
      .eq('user_id', userId),
    supabase
      .from('broker_connections')
      .update({
        status: storageError ? 'error' : 'ready',
        permissions: ['futures_read_verified', 'read_only_confirmed'],
        last_sync_at: finishedAt,
        last_error: storageError ? 'Vorschau konnte nicht vollständig gespeichert werden.' : null,
        updated_at: finishedAt,
      })
      .eq('id', connectionId)
      .eq('user_id', userId),
  ])

  return {
    warning: storageError ? 'Die Verbindung funktioniert, aber ein Teil der Vorschau konnte nicht gespeichert werden.' : null,
  }
}

export async function connectMexcBroker(input: ConnectMexcInput): Promise<BrokerActionResult> {
  const accountLabel = cleanText(input.accountLabel || 'MEXC Futures', 60) || 'MEXC Futures'
  const apiKey = input.apiKey.trim()
  const secretKey = input.secretKey.trim()

  if (!input.readOnlyConfirmed) {
    return {
      success: false,
      message: 'Bitte bestätige, dass Handels-, Transfer- und Auszahlungsrechte für diesen Schlüssel ausgeschaltet sind.',
    }
  }

  const validationMessage = validateCredentials(apiKey, secretKey)
  if (validationMessage) return { success: false, message: validationMessage }

  const problem = connectorRuntimeProblem()
  if (problem) return { success: false, message: problem }

  const user = await currentUser()
  if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }

  const supabase = createSupabaseServerClient()
  const { error: secureStoreError } = await supabase
    .from('broker_credentials')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
  if (secureStoreError) {
    return {
      success: false,
      message: 'Der sichere Zugangsspeicher fehlt. Bitte zuerst die SQL-Patches v57.60 und v57.60.1 in Supabase ausführen.',
    }
  }

  let readResult: MexcReadResult
  try {
    readResult = await readMexcFuturesPreview({ apiKey, secretKey })
  } catch (error) {
    if (error instanceof MexcReadError) {
      return { success: false, message: error.publicMessage }
    }
    return { success: false, message: 'Die MEXC-Verbindung konnte nicht geprüft werden.' }
  }

  const credentialId = crypto.randomUUID()
  const connectionId = crypto.randomUUID()

  try {
    const encryptedPayload = encryptBrokerCredentials({ apiKey, secretKey }, user.id, 'mexc')
    const now = new Date().toISOString()
    const { error: connectionError } = await supabase.rpc('equora_create_broker_connection_service_v1', {
      p_connection_id: connectionId,
      p_credential_id: credentialId,
      p_user_id: user.id,
      p_provider: 'mexc',
      p_account_label: accountLabel,
      p_encrypted_payload: encryptedPayload,
      p_key_version: 'v1',
      p_now: now,
    })

    if (connectionError) {
      return { success: false, message: 'Verbindung und Credential konnten nicht gemeinsam gespeichert werden. Bitte Migration v57.60.1 prüfen.' }
    }

    const persisted = await persistMexcPreview(supabase, user.id, connectionId, readResult)
    revalidatePath('/broker-sync')

    return {
      success: true,
      connectionId,
      message: persisted.warning
        ?? `MEXC wurde sicher verbunden. ${readResult.orders.length} Orders und ${readResult.executions.length} Ausführungen wurden zur Prüfung gefunden.`,
    }
  } catch {
    await supabase.rpc('equora_delete_broker_connection_service_v1', {
      p_connection_id: connectionId,
      p_user_id: user.id,
    })
    return { success: false, message: 'Die MEXC-Verbindung konnte nicht sicher gespeichert werden.' }
  }
}

export async function refreshMexcPreview(connectionId: string): Promise<BrokerActionResult> {
  const normalizedId = connectionId.trim()
  if (!normalizedId) return { success: false, message: 'Es wurde keine Verbindung ausgewählt.' }

  const problem = connectorRuntimeProblem()
  if (problem) return { success: false, message: problem }

  const user = await currentUser()
  if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }

  const supabase = createSupabaseServerClient()
  const { data: connectionData, error: connectionError } = await supabase
    .from('broker_connections')
    .select('id,provider,credential_reference')
    .eq('id', normalizedId)
    .eq('user_id', user.id)
    .single()

  if (connectionError || !connectionData) {
    return { success: false, message: 'Die Verbindung wurde nicht gefunden.' }
  }

  const connection = connectionData as StoredConnection
  if (connection.provider !== 'mexc' || !connection.credential_reference) {
    return { success: false, message: 'Für diese Verbindung ist kein sicherer MEXC-Zugang hinterlegt.' }
  }

  const { data: credentialData, error: credentialError } = await supabase
    .from('broker_credentials')
    .select('id,encrypted_payload')
    .eq('id', connection.credential_reference)
    .eq('user_id', user.id)
    .single()

  if (credentialError || !credentialData) {
    return { success: false, message: 'Der verschlüsselte Zugang konnte nicht gelesen werden.' }
  }

  try {
    const credential = credentialData as StoredCredential
    const credentials = decryptBrokerCredentials(credential.encrypted_payload, user.id, 'mexc')
    const readResult = await readMexcFuturesPreview(credentials)
    const persisted = await persistMexcPreview(supabase, user.id, normalizedId, readResult)
    revalidatePath('/broker-sync')

    return {
      success: true,
      connectionId: normalizedId,
      message: persisted.warning
        ?? `Prüfung abgeschlossen. ${readResult.orders.length} Orders und ${readResult.executions.length} Ausführungen wurden gefunden.`,
    }
  } catch (error) {
    const message = error instanceof MexcReadError
      ? error.publicMessage
      : 'Die gespeicherte MEXC-Verbindung konnte nicht geprüft werden.'

    await supabase
      .from('broker_connections')
      .update({ status: 'error', last_error: message, updated_at: new Date().toISOString() })
      .eq('id', normalizedId)
      .eq('user_id', user.id)

    revalidatePath('/broker-sync')
    return { success: false, message }
  }
}

export async function removeBrokerConnection(connectionId: string): Promise<BrokerActionResult> {
  const normalizedId = connectionId.trim()
  if (!normalizedId) return { success: false, message: 'Es wurde keine Verbindung ausgewählt.' }

  if (!hasSupabaseClientEnv()) return { success: false, message: 'Die Broker-Verbindung braucht eine konfigurierte Supabase-Umgebung.' }

  const user = await currentUser()
  if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }

  const supabase = await createSupabaseAuthServerClient()
  const { error: deleteError } = await supabase.rpc('delete_own_broker_connection', { p_connection_id: normalizedId })
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
