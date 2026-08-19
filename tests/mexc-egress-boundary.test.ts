import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

type ProductSource = Readonly<{
  absolutePath: string
  relativePath: string
  content: string
  imports: readonly string[]
}>

const WORKSPACE = process.cwd()
const PRODUCT_ROOTS = ['app', 'lib', 'components'] as const
const TRANSPORT_PATH = 'lib/server/mexc-transport.ts'
const CENTRAL_TRANSPORT_PATH = 'lib/server/mexc-central-network-transport.ts'
const REQUEST_CONTRACT_PATH = 'lib/server/mexc-request-contract.ts'
const ALLOWED_LOCAL_ROUTE_PATHS = ['app/api/sidebar-overview/route.ts'] as const
const FORBIDDEN_NETWORK_MODULES = new Set([
  'http', 'https', 'http2', 'net', 'tls',
  'node:http', 'node:https', 'node:http2', 'node:net', 'node:tls',
  'undici', 'axios', 'ws',
])

function toRelativePath(absolutePath: string) {
  return relative(WORKSPACE, absolutePath).replaceAll('\\', '/')
}

function productFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) return productFiles(absolutePath)
    return entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) ? [normalize(absolutePath)] : []
  })
}

function parseSource(content: string, path: string) {
  return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

function moduleSpecifiers(content: string, path: string) {
  const specifiers: string[] = []
  const sourceFile = parseSource(content, path)
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text)
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        specifiers.push(node.arguments[0].text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return specifiers
}

function findNetworkPrimitives(content: string, path: string) {
  const findings: string[] = []
  const sourceFile = parseSource(content, path)
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      if (FORBIDDEN_NETWORK_MODULES.has(node.moduleSpecifier.text)) findings.push(`module:${node.moduleSpecifier.text}`)
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'fetch') {
        const target = node.arguments[0]
        findings.push(target && ts.isStringLiteralLike(target) && target.text.startsWith('/') ? `local-fetch:${target.text}` : 'fetch')
      }
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'fetch') findings.push('property-fetch')
      if (ts.isElementAccessExpression(node.expression) && ts.isStringLiteralLike(node.expression.argumentExpression) && node.expression.argumentExpression.text === 'fetch') findings.push('element-fetch')
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]) && FORBIDDEN_NETWORK_MODULES.has(node.arguments[0].text)) {
        findings.push(`module:${node.arguments[0].text}`)
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'WebSocket') findings.push('websocket')
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return findings
}

function loadProductSources() {
  const paths = PRODUCT_ROOTS.flatMap((root) => productFiles(join(WORKSPACE, root)))
  return new Map(paths.map((absolutePath) => {
    const content = readFileSync(absolutePath, 'utf8')
    return [absolutePath, {
      absolutePath,
      relativePath: toRelativePath(absolutePath),
      content,
      imports: moduleSpecifiers(content, absolutePath),
    } satisfies ProductSource]
  }))
}

function resolveProductImport(source: ProductSource, specifier: string, sources: ReadonlyMap<string, ProductSource>) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
  const base = specifier.startsWith('@/')
    ? join(WORKSPACE, specifier.slice(2))
    : resolve(dirname(source.absolutePath), specifier)
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')].map(normalize)
  return candidates.find((candidate) => sources.has(candidate)) ?? null
}

function dependencyGraph(sources: ReadonlyMap<string, ProductSource>) {
  return new Map([...sources].map(([path, source]) => [
    path,
    source.imports.map((specifier) => resolveProductImport(source, specifier, sources)).filter((target): target is string => Boolean(target)),
  ]))
}

function reachableFiles(graph: ReadonlyMap<string, readonly string[]>, roots: readonly string[]) {
  const visited = new Set<string>()
  const pending = [...roots]
  while (pending.length) {
    const current = pending.pop()
    if (!current || visited.has(current)) continue
    visited.add(current)
    pending.push(...(graph.get(current) ?? []))
  }
  return visited
}

describe('MEXC repository-wide egress boundary', () => {
  it('allows the MEXC origin only in the pure request contract consumed by the central server-only transport', () => {
    const sources = loadProductSources()
    const originOwners = [...sources.values()]
      .filter((source) => /(?:api|contract)\.mexc\.com/.test(source.content))
      .map((source) => source.relativePath)

    expect(originOwners).toEqual([REQUEST_CONTRACT_PATH])
    expect(sources.get(normalize(join(WORKSPACE, TRANSPORT_PATH)))?.content).toContain("import 'server-only'")
    expect(sources.get(normalize(join(WORKSPACE, TRANSPORT_PATH)))?.content).toContain("from '@/lib/server/mexc-request-contract'")
    expect(sources.get(normalize(join(WORKSPACE, REQUEST_CONTRACT_PATH)))?.content).toContain("import 'server-only'")
  })

  it('forbids direct and transitive network primitives throughout the broker dependency graph', () => {
    const sources = loadProductSources()
    const graph = dependencyGraph(sources)
    const roots = [...sources.values()]
      .filter((source) => /(?:^|\/)[^/]*(?:broker|mexc)[^/]*(?:\/|$)/i.test(`/${source.relativePath}`))
      .map((source) => source.absolutePath)
    const allowedLocalRouteRoots = ALLOWED_LOCAL_ROUTE_PATHS.map((path) => normalize(join(WORKSPACE, path)))
    const brokerGraph = reachableFiles(graph, [...roots, ...allowedLocalRouteRoots])
    const findings = [...brokerGraph].flatMap((path) => {
      const source = sources.get(path)
      if (!source) return []
      return findNetworkPrimitives(source.content, source.absolutePath)
        .map((primitive) => ({ path: source.relativePath, primitive }))
    })

    expect(findings).toEqual([
      { path: TRANSPORT_PATH, primitive: 'fetch' },
      { path: 'components/layout/sidebar-nav.tsx', primitive: 'local-fetch:/api/sidebar-overview' },
    ])
  })

  it('keeps the private signer module-local and the single-use authorization consumer on the sole central transport', () => {
    const sources = loadProductSources()
    const privateSenderOwners = [...sources.values()]
      .filter((source) => /executeMexcPreparedPrivateRead/.test(source.content))
      .map((source) => source.relativePath)
    const authorizationConsumerOwners = [...sources.values()]
      .filter((source) => /consumeBrokerSendAuthorizationForTransport/.test(source.content))
      .map((source) => source.relativePath)
      .sort()
    const transport = sources.get(normalize(join(WORKSPACE, TRANSPORT_PATH)))?.content ?? ''
    const centralTransport = sources.get(normalize(join(WORKSPACE, CENTRAL_TRANSPORT_PATH)))?.content ?? ''

    expect(privateSenderOwners).toEqual([])
    expect(authorizationConsumerOwners).toEqual([
      'lib/server/broker-core-contracts.ts',
      TRANSPORT_PATH,
    ])
    expect(transport).toContain('function mexcPrivateReadHeaders(')
    expect(transport).not.toContain('export function mexcPrivateReadHeaders(')
    expect(transport).not.toContain('export async function executePreparedRequest(')
    expect(centralTransport).toContain("export { mexcBrokerNetworkTransport } from '@/lib/server/mexc-transport'")
  })

  it('detects an indirect bypass in a nested neutral-name module with the same AST and graph checks', () => {
    const root = normalize(join(WORKSPACE, '__mutant__', 'broker-entry.ts'))
    const neutral = normalize(join(WORKSPACE, '__mutant__', 'nested', 'transport-helper.ts'))
    const graph = new Map<string, readonly string[]>([[root, [neutral]], [neutral, []]])
    const mutantContent = "import { request } from 'node:https'\nexport const send = () => globalThis.fetch('https://example.invalid')\n"
    const findings = [...reachableFiles(graph, [root])].flatMap((path) => path === neutral ? findNetworkPrimitives(mutantContent, path) : [])

    expect(findings).toEqual(['module:node:https', 'property-fetch'])
  })

  it('does not ignore a local broker proxy and detects bare https imports in its neutral route', () => {
    const brokerClient = "export const read = () => fetch('/api/read-proxy')\n"
    const neutralRoute = "import { request } from 'https'\nexport const GET = () => request(process.env.BROKER_URL!)\n"

    expect(findNetworkPrimitives(brokerClient, 'components/broker-sync/new-reader.tsx')).toEqual(['local-fetch:/api/read-proxy'])
    expect(findNetworkPrimitives(neutralRoute, 'app/api/read-proxy/route.ts')).toEqual(['module:https'])
  })
})
