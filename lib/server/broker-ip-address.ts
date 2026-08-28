import 'server-only'

const STRICT_IPV4_PART = /^(?:0|[1-9][0-9]{0,2})$/

export type BrokerEgressIpPolicy = 'synthetic_documentation'

function strictIpv4Parts(value: string) {
  const parts = value.split('.')
  if (parts.length !== 4 || parts.some((part) => !STRICT_IPV4_PART.test(part))) return null
  const octets = parts.map(Number)
  return octets.every((part) => part >= 0 && part <= 255) ? octets : null
}

function isStrictIpv4(value: string) {
  return strictIpv4Parts(value) !== null
}

function ipv6PartUnits(parts: readonly string[], allowEmbeddedIpv4: boolean) {
  let units = 0
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (!part) return null
    if (part.includes('.')) {
      if (!allowEmbeddedIpv4 || index !== parts.length - 1 || !isStrictIpv4(part)) return null
      units += 2
    } else {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return null
      units += 1
    }
  }
  return units
}

function isIpv6Syntax(value: string) {
  if (!value.includes(':') || value.includes('%') || !/^[0-9a-f:.]+$/i.test(value)) return false
  const compressionParts = value.split('::')
  if (compressionParts.length > 2) return false
  const compressed = compressionParts.length === 2
  const left = compressionParts[0] ? compressionParts[0].split(':') : []
  const right = compressionParts[1] ? compressionParts[1].split(':') : []
  const leftUnits = ipv6PartUnits(left, !compressed && right.length === 0)
  const rightUnits = ipv6PartUnits(right, true)
  if (leftUnits === null || rightUnits === null) return false
  const units = leftUnits + rightUnits
  return compressed ? units < 8 : units === 8
}

function canonicalIpv6(value: string) {
  if (!isIpv6Syntax(value)) return null
  try {
    const hostname = new URL(`http://[${value.toLowerCase()}]/`).hostname
    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : null
  } catch {
    return null
  }
}

function ipv4DocumentationRange(octets: readonly number[]) {
  const [first, second, third] = octets
  return first === 192 && second === 0 && third === 2
    || first === 198 && second === 51 && third === 100
    || first === 203 && second === 0 && third === 113
}

function ipv6DocumentationRange(value: string) {
  return value.startsWith('2001:db8:')
}

export function isBrokerIpAddressSyntax(value: unknown): value is string {
  return typeof value === 'string' && (isStrictIpv4(value) || isIpv6Syntax(value))
}

export function canonicalizeBrokerEgressIpAddress(
  value: unknown,
  policy: BrokerEgressIpPolicy,
) {
  if (typeof value !== 'string' || value.length < 1) return null
  const asciiTrimmed = value.replace(/^ +| +$/g, '')
  const ipv4 = strictIpv4Parts(asciiTrimmed)
  if (ipv4) {
    return policy === 'synthetic_documentation' && ipv4DocumentationRange(ipv4) ? ipv4.join('.') : null
  }
  const ipv6 = canonicalIpv6(asciiTrimmed)
  if (!ipv6) return null
  return policy === 'synthetic_documentation' && ipv6DocumentationRange(ipv6) ? ipv6 : null
}

export function canonicalizeBrokerEgressIpSet(
  input: readonly string[],
  policy: BrokerEgressIpPolicy,
) {
  if (input.length < 1) return null
  const normalized = input.map((entry) => canonicalizeBrokerEgressIpAddress(entry, policy))
  if (normalized.some((entry) => entry === null)) return null
  const canonical = normalized as string[]
  if (new Set(canonical).size !== canonical.length) return null
  return Object.freeze(canonical.toSorted((left, right) => left < right ? -1 : left > right ? 1 : 0))
}
