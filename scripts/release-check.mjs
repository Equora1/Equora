import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const failures = []

function fail(message) {
  failures.push(message)
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const expected = {
  name: 'equora-starter-v57.60.1',
  version: '0.57.60-1',
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
if (!envExample.includes('EQUORA_BROKER_SECRET_KEY=')) fail('Broker-Verschlüsselungsschlüssel fehlt in .env.example.')
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

const mexcClient = readFileSync(join(root, 'lib/server/mexc-readonly.ts'), 'utf8')
for (const forbiddenMethod of ["method: 'POST'", "method: 'DELETE'", 'order/submit', 'order/cancel']) {
  if (mexcClient.includes(forbiddenMethod)) fail(`Schreibender MEXC-Zugriff gefunden: ${forbiddenMethod}`)
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
      const secretPatterns = [
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
        /(?:SUPABASE_SERVICE_ROLE_KEY|EQUORA_BROKER_SECRET_KEY|EQUORA_MAINTENANCE_SECRET)[ \t]*=[ \t]*[A-Za-z0-9+/_=-]{24,}/,
        /(?:api[_-]?key|secret|token|password|private[_-]?key)[ \t]*[:=][ \t]*["']?[A-Za-z0-9+/_=-]{24,}/i,
      ]
      if (secretPatterns.some((pattern) => pattern.test(value))) fail(`Mögliches Secret in ${relative(root, path)}`)
    }
  }
}
walk(root)

if (failures.length) {
  console.error('Release-Check fehlgeschlagen:')
  for (const item of failures) console.error(`- ${item}`)
  process.exit(1)
}

console.log(`Release-Check erfolgreich: v57.60.1${zipMode ? ' ist sauber für die ZIP-Verpackung' : ' erfüllt die Produkt-Gates'}.`)
