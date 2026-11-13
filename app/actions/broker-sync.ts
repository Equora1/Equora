'use server'

import { journalText, type JournalLocale } from '@/lib/i18n/journal'
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
import { isMexcRuntimeActivated } from '@/lib/server/mexc-runtime'
import type { BrokerActionResult, ConnectMexcInput } from '@/lib/types/broker-sync'

const SYMBOL_PATTERN = /^[A-Z0-9]{1,20}_[A-Z0-9]{1,20}$/

function normalizedSymbols(value: string) {
  const symbols = value.split(/[\s,;]+/u).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
  if (!symbols.length || symbols.length > 5 || new Set(symbols).size !== symbols.length) return null
  return symbols.every((symbol) => SYMBOL_PATTERN.test(symbol)) ? symbols : null
}

function probeMessage(code: string, locale: JournalLocale) {
  const text = journalText(locale)
  if (code === 'invalid_credential') return text("MEXC hat API Key oder Secret abgelehnt.", "MEXC rejected the API key or secret.")
  if (code === 'permission_missing') return text("Die MEXC-Leseberechtigung „View Order Details“ fehlt für mindestens eine Futures-Historie.", "The MEXC permission “View Order Details” is missing for part of your futures history.")
  if (code === 'ip_not_allowed') return text("Die aktuelle Vercel-IP ist im MEXC-Key nicht freigegeben.", "The app’s IP address is not allowed by this MEXC key.")
  if (code === 'unsupported_contract' || code === 'invalid_request') return text("Mindestens ein Symbol wird von MEXC für diesen Futures-Leseabruf nicht akzeptiert.", "MEXC rejected at least one symbol for this futures data check.")
  return text("Der MEXC-Lesezugriff konnte nicht vollständig geprüft werden.", "The MEXC read check could not be completed.")
}

export async function connectMexcBroker(input: ConnectMexcInput, locale: JournalLocale = 'de'): Promise<BrokerActionResult> {
  const text = journalText(locale)
  if (!isMexcRuntimeActivated()) return { success: false, message: text('Der MEXC-Abruf ist deaktiviert.', 'MEXC data access is off.') }
  if (!hasSupabaseClientEnv() || !hasSupabaseServerEnv()) {
    return { success: false, message: text("Die sichere Brokerverbindung ist derzeit nicht verfügbar.", "Secure broker setup is unavailable.") }
  }
  if (!hasBrokerSecretKey() || !hasBrokerIdentityKey()) {
    return { success: false, message: text("Die sichere Speicherung für diese Verbindung ist nicht verfügbar.", "Secure storage for this connection is unavailable.") }
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
  ) return { success: false, message: text("Verbindungsname, 1–5 Futures-Symbole und bestätigte Read-only-Zugangsdaten sind erforderlich.", "Enter a connection name and 1 to 5 futures symbols, and confirm that the keys are read-only.") }

  const authClient = await createSupabaseAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { success: false, message: text("Bitte zuerst einloggen.", "Sign in first.") }

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
      message: text(
        `Lesezugriff für ${applied.symbolCount} MEXC-Symbole geprüft. Du hast den Nur-Lese-Zugriff bestätigt.`,
        `Read access checked for ${applied.symbolCount} MEXC symbols. You confirmed read-only access.`,
      ),
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof MexcReadonlyProbeError
        ? probeMessage(error.code, locale)
        : text("Die Nur-Lese-Verbindung wurde nicht angelegt. Ein Prüfvermerk ohne Zugangsdaten kann bestehen bleiben.", "The read-only connection could not be set up. An audit record without credentials may remain."),
    }
  }
}

export async function refreshMexcPreview(connectionId: string, locale: JournalLocale = 'de'): Promise<BrokerActionResult> {
  const text = journalText(locale)
  if (!hasSupabaseClientEnv()) return { success: false, message: text("Die Verbindungsansicht ist nicht verfügbar.", "The connection view is unavailable.") }
  const normalizedId = connectionId.trim()
  if (!/^[a-f0-9-]{36}$/.test(normalizedId)) return { success: false, message: text("Die Verbindung ist ungültig.", "This connection is invalid.") }
  const authClient = await createSupabaseAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { success: false, message: text("Bitte zuerst einloggen.", "Sign in first.") }
  const { data: connection, error } = await authClient
    .from('broker_connections')
    .select('id')
    .eq('id', normalizedId)
    .eq('user_id', user.id)
    .eq('provider', 'mexc')
    .maybeSingle()
  if (error || !connection) return { success: false, message: text("Die Verbindung wurde nicht gefunden.", "The connection was not found.") }
  revalidatePath('/broker-sync')
  return {
    success: true,
    message: text("Die lokale Journalansicht wurde aktualisiert. Es wurde kein Schedulerlauf und kein Brokerrequest ausgelöst.", "The view was refreshed without contacting the broker."),
  }
}

export async function removeBrokerConnection(connectionId: string, locale: JournalLocale = 'de'): Promise<BrokerActionResult> {
  const text = journalText(locale)
  const normalizedId = connectionId.trim()
  if (!normalizedId) return { success: false, message: text("Es wurde keine Verbindung ausgewählt.", "Choose a connection first.") }
  if (!hasSupabaseClientEnv()) return { success: false, message: text("Die Brokerverwaltung ist nicht verfügbar.", "Broker management is unavailable.") }
  const authClient = await createSupabaseAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { success: false, message: text("Bitte zuerst einloggen.", "Sign in first.") }
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
        ? text("Die erforderliche Datenbankmigration fehlt. Es wurde nichts verändert.", "Revocation is unavailable because setup is incomplete. The connection was not changed.")
        : text("Die Verbindung konnte nicht widerrufen werden.", "The connection could not be revoked."),
    }
  }
  revalidatePath('/broker-sync')
  return { success: true, message: text("Die Verbindung wurde widerrufen. Brokerzugriff und gespeichertes Credential sind unbrauchbar; historische Rohdaten bleiben für die Journalprüfung erhalten.", "Connection revoked. Broker access is blocked and historical data is kept.") }
}
