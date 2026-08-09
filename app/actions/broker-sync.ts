'use server'

import { randomBytes, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import {
  encryptBrokerCredentials,
  getActiveBrokerSecretKeyVersion,
  hasBrokerSecretKey,
} from '@/lib/server/broker-secret-store'
import {
  createMexcBrokerAccountIdentity,
  hasBrokerIdentityKey,
} from '@/lib/server/broker-account-identity'
import { probeMexcReadonlyCredentials, MexcReadonlyProbeError } from '@/lib/server/mexc-readonly-probe'
import {
  applyMexcConnectionSetup,
  applyMexcConnectionRevocation,
  requestMexcConnectionSetupWithClient,
  requestMexcConnectionRevocationWithClient,
} from '@/lib/server/broker-runtime-control'
import { isMexcRuntimeActivated, MEXC_RUNTIME_BLOCK_MESSAGE } from '@/lib/server/mexc-runtime'
import type { BrokerActionResult, ConnectMexcInput } from '@/lib/types/broker-sync'

const SYMBOL_PATTERN = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/

function normalizedSymbols(value: string) {
  const symbols = value.split(/[\s,;]+/u).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
  if (!symbols.length || symbols.length > 5 || new Set(symbols).size !== symbols.length) return null
  return symbols.every((symbol) => SYMBOL_PATTERN.test(symbol)) ? symbols : null
}

function probeMessage(code: string) {
  if (code === 'invalid_credential') return 'MEXC hat API Key oder Secret abgelehnt.'
  if (code === 'permission_missing') return 'Die MEXC-Leseberechtigung „View Order Details“ fehlt für mindestens eine Futures-Historie.'
  if (code === 'ip_not_allowed') return 'Die aktuelle Vercel-IP ist im MEXC-Key nicht freigegeben.'
  if (code === 'unsupported_contract' || code === 'invalid_request') return 'Mindestens ein Symbol wird von MEXC für diesen Futures-Leseabruf nicht akzeptiert.'
  return 'Der ausschließlich lesende MEXC-Evidenzlauf konnte nicht vollständig abgeschlossen werden.'
}

export async function connectMexcBroker(input: ConnectMexcInput): Promise<BrokerActionResult> {
  if (!isMexcRuntimeActivated()) return { success: false, message: MEXC_RUNTIME_BLOCK_MESSAGE }
  if (!hasSupabaseClientEnv() || !hasSupabaseServerEnv()) {
    return { success: false, message: 'Supabase ist für die sichere Brokerverbindung nicht vollständig konfiguriert.' }
  }
  if (!hasBrokerSecretKey() || !hasBrokerIdentityKey()) {
    return { success: false, message: 'Broker-Keyring oder pseudonymer Kontoidentitätsschlüssel fehlt in der Serverumgebung.' }
  }
  const accountLabel = input.accountLabel.trim()
  const apiKey = input.apiKey.trim()
  const secretKey = input.secretKey.trim()
  const symbols = normalizedSymbols(input.symbols)
  if (
    !input.readOnlyConfirmed
    || !accountLabel
    || accountLabel.length > 60
    || apiKey.length < 8
    || apiKey.length > 256
    || secretKey.length < 8
    || secretKey.length > 256
    || !symbols
  ) return { success: false, message: 'Verbindungsname, 1–5 Futures-Symbole und bestätigte Read-only-Zugangsdaten sind erforderlich.' }

  const authClient = await createSupabaseAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }

  try {
    const requestId = randomUUID()
    // Check rollout enrollment and account/symbol bounds before any broker GET
    // or secret persistence. The setup intent itself contains no credential.
    await requestMexcConnectionSetupWithClient(authClient, {
      requestId,
      accountLabel,
      symbols,
    })
    // This is the sole pre-activation exception: a user-triggered GET-only
    // evidence probe. It never stores raw bodies and cannot call a mutation.
    await probeMexcReadonlyCredentials({ apiKey, secretKey }, symbols)
    const identity = createMexcBrokerAccountIdentity(apiKey)
    const encryptedPayload = encryptBrokerCredentials({ apiKey, secretKey }, user.id, 'mexc')
    const integrityKey = randomBytes(32)
    let applied
    try {
      applied = await applyMexcConnectionSetup({
        commandId: requestId,
        encryptedPayload,
        credentialKeyVersion: getActiveBrokerSecretKeyVersion(),
        accountIdentityDigest: identity.digest,
        accountIdentityKeyVersion: identity.keyVersion,
        integrityKeyBase64: integrityKey.toString('base64'),
      })
    } finally {
      integrityKey.fill(0)
    }
    revalidatePath('/broker-sync')
    return {
      success: true,
      connectionId: applied.connectionId,
      message: `Die MEXC-Lesecapabilities wurden für ${applied.symbolCount} Symbol(e) erfolgreich abgefragt. Read-only wurde von dir bestätigt; Equora besitzt keine Tradingfunktion.`,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof MexcReadonlyProbeError
        ? probeMessage(error.code)
        : 'Die Read-only-Verbindung wurde nicht angelegt. Credentials, Brokerkonto, Aktivierung und Work Units wurden nicht akzeptiert; ein secret-freies Setup-Intent kann als Auditspur bestehen bleiben.',
    }
  }
}

export async function refreshMexcPreview(connectionId: string): Promise<BrokerActionResult> {
  if (!hasSupabaseClientEnv()) return { success: false, message: 'Die Ansicht braucht eine konfigurierte Supabase-Umgebung.' }
  const normalizedId = connectionId.trim()
  if (!/^[a-f0-9-]{36}$/.test(normalizedId)) return { success: false, message: 'Die Verbindung ist ungültig.' }
  const authClient = await createSupabaseAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }
  const { data: connection, error } = await authClient
    .from('broker_connections')
    .select('id')
    .eq('id', normalizedId)
    .eq('user_id', user.id)
    .eq('provider', 'mexc')
    .maybeSingle()
  if (error || !connection) return { success: false, message: 'Die Verbindung wurde nicht gefunden.' }
  revalidatePath('/broker-sync')
  return {
    success: true,
    message: 'Die lokale Journalansicht wurde aktualisiert. Es wurde kein Schedulerlauf und kein Brokerrequest ausgelöst.',
  }
}

export async function removeBrokerConnection(connectionId: string): Promise<BrokerActionResult> {
  const normalizedId = connectionId.trim()
  if (!normalizedId) return { success: false, message: 'Es wurde keine Verbindung ausgewählt.' }
  if (!hasSupabaseClientEnv()) return { success: false, message: 'Die Broker-Verbindung braucht eine konfigurierte Supabase-Umgebung.' }
  const authClient = await createSupabaseAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { success: false, message: 'Bitte zuerst einloggen.' }
  try {
    const requestId = randomUUID()
    await requestMexcConnectionRevocationWithClient(authClient, {
      connectionId: normalizedId,
      requestId,
    })
    const result = await applyMexcConnectionRevocation(requestId)
    if (result.connectionId !== normalizedId) throw new Error('CONNECTION_REVOCATION_RESULT_DRIFT')
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const migrationMissing = message.includes('PGRST202') || message.toLowerCase().includes('schema cache')
    return {
      success: false,
      message: migrationMissing
        ? 'Die erforderliche Datenbankmigration fehlt. Es wurde nichts verändert.'
        : 'Die Verbindung konnte nicht atomar widerrufen werden. Authority und Credential wurden nicht teilweise verändert.',
    }
  }
  revalidatePath('/broker-sync')
  return { success: true, message: 'Die Verbindung wurde widerrufen. Brokerzugriff und gespeichertes Credential sind unbrauchbar; historische Rohdaten bleiben für die Journalprüfung erhalten.' }
}
