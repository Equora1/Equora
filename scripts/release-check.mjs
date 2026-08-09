import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const failures = []

function fail(message) {
  failures.push(message)
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const expected = {
  name: 'equora-starter-v57.61.0',
  version: '0.57.61-0',
  next: '15.5.21',
  sharp: '0.35.3',
  postcss: '8.5.23',
  vitest: '4.1.10',
}

if (packageJson.name !== expected.name) fail(`package name: ${packageJson.name}`)
if (packageJson.version !== expected.version) fail(`package version: ${packageJson.version}`)
if (packageJson.dependencies?.next !== expected.next) fail(`next: ${packageJson.dependencies?.next}`)
if (packageJson.dependencies?.sharp !== expected.sharp) fail(`sharp: ${packageJson.dependencies?.sharp}`)
if (packageJson.devDependencies?.postcss !== expected.postcss) fail(`postcss: ${packageJson.devDependencies?.postcss}`)
if (packageJson.devDependencies?.vitest !== expected.vitest) fail(`vitest: ${packageJson.devDependencies?.vitest}`)
if (packageJson.overrides?.next?.postcss !== expected.postcss) fail('Next.js PostCSS override fehlt oder ist falsch.')
if (packageJson.overrides?.postcss !== expected.postcss) fail('PostCSS override fehlt oder ist falsch.')
if (packageJson.overrides?.sharp !== expected.sharp) fail('Sharp override fehlt oder ist falsch.')

if (!existsSync(join(root, 'package-lock.json'))) fail('package-lock.json fehlt.')

const zipMode = process.env.EQUORA_ZIP_CHECK === 'true'
const obsoleteHandoff = 'UEBERGABE-v57.60-fuer-v57.61.txt'
if (zipMode && existsSync(join(root, obsoleteHandoff))) {
  fail(`${obsoleteHandoff} ist laut bindendem Handoff keine Release-Arbeitsanweisung und darf nicht im ZIP liegen.`)
}

const forbiddenRoots = ['node_modules', '.next', '.git', '.env.local', 'tsconfig.tsbuildinfo']
if (zipMode) {
  for (const item of forbiddenRoots) {
    if (existsSync(join(root, item))) fail(`Nicht für ZIP geeignet: ${item}`)
  }
}

const sidebar = readFileSync(join(root, 'components/layout/sidebar-nav.tsx'), 'utf8')
if (sidebar.includes("label: 'Performance'")) fail('Performance-Reiter ist noch in der Sidebar.')
if (!sidebar.includes("label: 'Broker verbinden'")) fail('Benutzerfreundlicher Broker-Menüpunkt fehlt.')

const envExample = readFileSync(join(root, '.env.example'), 'utf8')
if (!envExample.includes('EQUORA_PERFORMANCE_DIAGNOSTICS=false')) fail('Diagnose-Schalter fehlt in .env.example.')
if (!envExample.includes('EQUORA_BROKER_SECRET_KEYS={}')) fail('Versionierter Broker-Keyring fehlt in .env.example.')
if (!envExample.includes('EQUORA_BROKER_SECRET_ACTIVE_KEY_VERSION=')) fail('Aktive Broker-Keyversion fehlt in .env.example.')
if (!envExample.includes('EQUORA_BROKER_IDENTITY_KEY=')) fail('Broker-Identitätsschlüssel fehlt in .env.example.')
if (!envExample.includes('EQUORA_MEXC_RUNTIME_MODE=off')) fail('MEXC-Runtime ist in .env.example nicht default-off.')
if (!envExample.includes('CRON_SECRET=')) fail('Vercel-Cron-Secret fehlt in .env.example.')
if (!envExample.includes('EQUORA_MAINTENANCE_SECRET=')) fail('Maintenance-Schlüssel für Outbox-Retries fehlt in .env.example.')

const brokerPatch = readFileSync(join(root, 'supabase/schema-patch-v57.60.sql'), 'utf8')
if (!brokerPatch.includes('broker_credentials')) fail('SQL-Patch für den Broker-Zugangsspeicher fehlt.')
if (/create policy[\s\S]*broker_credentials/i.test(brokerPatch)) fail('broker_credentials darf keine Client-Policy erhalten.')

const releasePatch = readFileSync(join(root, 'supabase/schema-patch-v57.60.1.sql'), 'utf8')
for (const requiredFragment of [
  "set public = false",
  'media_cleanup_outbox',
  'equora_register_media_upload_intents_v1',
  'equora_create_trade_v1',
  'equora_update_trade_v1',
  'equora_import_trades_v1',
  'equora_revert_import_v1',
  'equora_replace_trade_tags_v1',
  'equora_accept_setup_suggestion_v1',
  'delete_own_broker_connection',
  'trades_monetary_values_require_currency_v57601',
  'review_sessions_monetary_scope_v57601',
  'trade_media_parent_owner_v57601',
  'setup_media_parent_owner_v57601',
]) {
  if (!releasePatch.includes(requiredFragment)) fail(`v57.60.1 SQL-Gate fehlt: ${requiredFragment}`)
}

const storageClient = readFileSync(join(root, 'lib/supabase/storage.ts'), 'utf8')
if (storageClient.includes('getPublicUrl')) fail('Persistente öffentliche Medien-URL weiterhin im Storage-Client gefunden.')
if (!storageClient.includes('createSignedUrl')) fail('Private Medienvorschau über Signed URL fehlt.')

const mexcServerFiles = readdirSync(join(root, 'lib/server'))
  .filter((name) => name.startsWith('mexc-') && name.endsWith('.ts'))
for (const name of mexcServerFiles) {
  const mexcClient = readFileSync(join(root, 'lib/server', name), 'utf8')
  for (const forbiddenMethod of [
    "method: 'POST'", "method: 'PUT'", "method: 'PATCH'", "method: 'DELETE'",
    'order/submit', 'order/cancel', 'position/close', 'asset/transfer', 'withdraw',
  ]) {
    if (mexcClient.toLowerCase().includes(forbiddenMethod.toLowerCase())) {
      fail(`Schreibender MEXC-Zugriff in ${name} gefunden: ${forbiddenMethod}`)
    }
  }
}

const runtimePatch = readFileSync(join(root, 'supabase/schema-patch-v57.61.0-g1-runtime-deployment.sql'), 'utf8')
for (const requiredFragment of [
  'equora_request_mexc_connection_setup_v1',
  'equora_apply_mexc_connection_setup_v1',
  'equora_load_broker_capture_material_v1',
  'equora_finalize_broker_capture_scope_v1',
  "'automaticImportAuthorized', false",
  "'tradingAuthorized', false",
]) {
  if (!runtimePatch.includes(requiredFragment)) fail(`Runtime-Deployment-SQL-Gate fehlt: ${requiredFragment}`)
}
if (/\b(?:http_get|http_post|net\.http|cron\.schedule)\b/i.test(runtimePatch)) {
  fail('Runtime-Deployment-Migration darf weder Netzwerkzugriff noch Cron aktivieren.')
}

const vercelConfig = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
if (Array.isArray(vercelConfig.crons) && vercelConfig.crons.length) {
  fail('Auslieferungs-vercel.json muss den Broker-Cron bis zur Betreiberfreigabe deaktiviert lassen.')
}
if (vercelConfig.functions?.['app/api/internal/broker-capture/route.ts']?.maxDuration !== 300) {
  fail('Broker-Capture-Route muss das gepinnte 300-Sekunden-Vercel-Budget besitzen.')
}
const captureCronExample = JSON.parse(readFileSync(join(root, 'vercel.capture.pro.example.json'), 'utf8'))
if (
  !Array.isArray(captureCronExample.crons)
  || captureCronExample.crons.length !== 1
  || captureCronExample.crons[0]?.path !== '/api/internal/broker-capture'
  || captureCronExample.crons[0]?.schedule !== '*/5 * * * *'
) {
  fail('Das kontrollierte Vercel-Pro-Cronbeispiel verletzt den Fünf-Minuten-Kapazitätsvertrag.')
}
if (captureCronExample.functions?.['app/api/internal/broker-capture/route.ts']?.maxDuration !== 300) {
  fail('Cronbeispiel muss das gepinnte 300-Sekunden-Vercel-Budget besitzen.')
}

const textExtensions = new Set(['.json', '.md', '.ts', '.tsx', '.js', '.mjs', '.mts', '.ps1', '.css', '.txt', '.example', '.sql'])
function extension(file) {
  const index = file.lastIndexOf('.')
  return index >= 0 ? file.slice(index) : ''
}
function walk(directory) {
  for (const name of readdirSync(directory)) {
    if (['node_modules', '.next', '.git'].includes(name)) continue
    const path = join(directory, name)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      walk(path)
      continue
    }
    if (!textExtensions.has(extension(name)) && name !== '.env.example') continue
    const value = readFileSync(path, 'utf8')
    const internalRegistry = ['packages.applied-caas-gateway1', 'internal.api.openai.org'].join('.')
    if (value.includes(internalRegistry)) {
      fail(`Interne Registry-Adresse in ${relative(root, path)}`)
    }
    if (name !== '.env.example') {
      const fixedSecretPatterns = [
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
        /(?:SUPABASE_SERVICE_ROLE_KEY|EQUORA_BROKER_SECRET_KEY|EQUORA_MAINTENANCE_SECRET)[ \t]*=[ \t]*[A-Za-z0-9+/_=-]{24,}/,
      ]
      const genericSecretPattern = /(?:api[_-]?key|secret|token|password|private[_-]?key)[ \t]*[:=][ \t]*["']?([A-Za-z0-9+/_=-]{24,})/gi
      const genericSecret = [...value.matchAll(genericSecretPattern)].some((match) => {
        const candidate = match[1]
        return !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(candidate)
          && !/(?:dummy|fixture|must-not-cross-boundary|synthetic|test)/i.test(candidate)
      })
      if (fixedSecretPatterns.some((pattern) => pattern.test(value)) || genericSecret) {
        fail(`Mögliches Secret in ${relative(root, path)}`)
      }
    }
  }
}
walk(root)

if (failures.length) {
  console.error('Release-Check fehlgeschlagen:')
  for (const item of failures) console.error(`- ${item}`)
  process.exit(1)
}

console.log(`Release-Check erfolgreich: v57.61.0${zipMode ? ' ist sauber für die ZIP-Verpackung' : ' erfüllt die Produkt-Gates'}.`)
