import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const failures = []

function fail(message) {
  failures.push(message)
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const expected = {
  name: 'equora-starter-v57.60',
  version: '0.57.60',
  next: '15.5.21',
  sharp: '0.35.3',
  postcss: '8.5.18',
}

if (packageJson.name !== expected.name) fail(`package name: ${packageJson.name}`)
if (packageJson.version !== expected.version) fail(`package version: ${packageJson.version}`)
if (packageJson.dependencies?.next !== expected.next) fail(`next: ${packageJson.dependencies?.next}`)
if (packageJson.dependencies?.sharp !== expected.sharp) fail(`sharp: ${packageJson.dependencies?.sharp}`)
if (packageJson.devDependencies?.postcss !== expected.postcss) fail(`postcss: ${packageJson.devDependencies?.postcss}`)
if (packageJson.overrides?.postcss !== expected.postcss) fail('PostCSS override fehlt oder ist falsch.')
if (packageJson.overrides?.sharp !== expected.sharp) fail('Sharp override fehlt oder ist falsch.')

const forbiddenRoots = ['node_modules', '.next', '.git', '.env.local', 'tsconfig.tsbuildinfo']
for (const item of forbiddenRoots) {
  if (existsSync(join(root, item))) fail(`Nicht für ZIP geeignet: ${item}`)
}

const sidebar = readFileSync(join(root, 'components/layout/sidebar-nav.tsx'), 'utf8')
if (sidebar.includes("label: 'Performance'")) fail('Performance-Reiter ist noch in der Sidebar.')
if (!sidebar.includes("label: 'Broker verbinden'")) fail('Benutzerfreundlicher Broker-Menüpunkt fehlt.')

const envExample = readFileSync(join(root, '.env.example'), 'utf8')
if (!envExample.includes('EQUORA_PERFORMANCE_DIAGNOSTICS=false')) fail('Diagnose-Schalter fehlt in .env.example.')
if (!envExample.includes('EQUORA_BROKER_SECRET_KEY=')) fail('Broker-Verschlüsselungsschlüssel fehlt in .env.example.')

const brokerPatch = readFileSync(join(root, 'supabase/schema-patch-v57.60.sql'), 'utf8')
if (!brokerPatch.includes('broker_credentials')) fail('SQL-Patch für den Broker-Zugangsspeicher fehlt.')
if (/create policy[\s\S]*broker_credentials/i.test(brokerPatch)) fail('broker_credentials darf keine Client-Policy erhalten.')

const mexcClient = readFileSync(join(root, 'lib/server/mexc-readonly.ts'), 'utf8')
for (const forbiddenMethod of ["method: 'POST'", "method: 'DELETE'", 'order/submit', 'order/cancel']) {
  if (mexcClient.includes(forbiddenMethod)) fail(`Schreibender MEXC-Zugriff gefunden: ${forbiddenMethod}`)
}

const textExtensions = new Set(['.json', '.md', '.ts', '.tsx', '.js', '.mjs', '.css', '.txt', '.example', '.sql'])
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
  }
}
walk(root)

if (failures.length) {
  console.error('Release-Check fehlgeschlagen:')
  for (const item of failures) console.error(`- ${item}`)
  process.exit(1)
}

console.log('Release-Check erfolgreich: v57.60 ist sauber für die ZIP-Verpackung.')
