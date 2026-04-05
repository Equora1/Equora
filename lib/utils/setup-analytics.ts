import type { SetupMediaRow, SetupRow } from '@/lib/types/db'
import type { SavedSetup, SavedSetupMedia, SetupDetail, SetupImageItem, SetupLibraryItem } from '@/lib/types/setup'
import type { Trade } from '@/lib/types/trade'
import { findBestMarket, getCoreMetrics } from '@/lib/utils/analytics'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'

function normalizeCategory(category: string | null | undefined) {
  return category?.trim() || 'Custom'
}

export function buildSavedSetups(setupRows: SetupRow[], setupMediaRows: SetupMediaRow[]): SavedSetup[] {
  const mediaBySetup = setupMediaRows.reduce<Record<string, SavedSetupMedia[]>>((acc, row) => {
    if (!acc[row.setup_id]) acc[row.setup_id] = []
    acc[row.setup_id].push({
      id: row.id,
      storagePath: row.storage_path,
      publicUrl: row.public_url,
      fileName: row.file_name,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      sortOrder: row.sort_order ?? 0,
      isCover: Boolean(row.is_cover),
      caption: row.caption,
      mediaRole: row.media_role ?? 'example',
    })
    return acc
  }, {})

  return setupRows
    .map((row) => {
      const media = [...(mediaBySetup[row.id] ?? [])].sort((left, right) => left.sortOrder - right.sortOrder)
      const cover = media.find((item) => item.isCover)?.publicUrl ?? row.cover_image_url ?? null
      return {
        id: row.id,
        title: row.title,
        category: row.category,
        description: row.description,
        playbook: row.playbook,
        checklist: row.checklist ?? [],
        mistakes: row.mistakes ?? [],
        coverImageUrl: cover,
        isArchived: Boolean(row.is_archived),
        sortOrder: row.sort_order ?? 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        media,
      } satisfies SavedSetup
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'de'))
}

export function buildSetupLibraryFromSources(baseSetups: SetupLibraryItem[], setupRows: SetupRow[], trades: Trade[]) {
  const ordered = [
    ...baseSetups,
    ...setupRows.map((setup) => ({
      title: setup.title,
      category: normalizeCategory(setup.category),
      description: setup.description?.trim() || 'Persönliches Setup aus deinem Playbook.',
    })),
    ...Array.from(new Set(trades.map((trade) => trade.setup))).map((title) => ({
      title,
      category: normalizeCategory(trades.find((trade) => trade.setup === title)?.concept),
      description: 'Automatisch aus deinen Trade-Daten erzeugtes Setup.',
    })),
  ]

  return Array.from(new Map(ordered.map((setup) => [setup.title, setup])).values())
}

export function buildDynamicSetupDetail(
  base: SetupDetail | undefined,
  linkedTrades: Trade[],
  row?: SetupRow,
  mediaRows: SetupMediaRow[] = [],
): SetupDetail | undefined {
  if (!base && !row && !linkedTrades.length) return undefined

  const metrics = getCoreMetrics(linkedTrades)
  const bestMarket = findBestMarket(linkedTrades)?.[0] ?? base?.bestMarket ?? '—'
  const bestSession =
    Object.entries(
      linkedTrades.reduce<Record<string, number>>((acc, trade) => {
        acc[trade.session] = (acc[trade.session] ?? 0) + (trade.netPnL ?? 0)
        return acc
      }, {}),
    ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? base?.bestSession ?? '—'

  const imageItems: SetupImageItem[] = mediaRows.length
    ? [...mediaRows]
        .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
        .map((row) => ({
          id: row.id,
          url: row.public_url,
          caption: row.caption,
          mediaRole: row.media_role ?? 'example',
          isCover: Boolean(row.is_cover),
        }))
    : base?.exampleImageItems ?? (base?.exampleImages ?? []).map((url, index) => ({ url, isCover: index === 0, mediaRole: 'example' as const }))

  const coverImage = imageItems.find((item) => item.isCover)?.url ?? row?.cover_image_url ?? base?.coverImage

  return {
    category: normalizeCategory(row?.category ?? base?.category),
    entry: base?.entry ?? 'Noch keine feste Entry-Logik dokumentiert.',
    exit: base?.exit ?? 'Noch keine feste Exit-Logik dokumentiert.',
    invalidation: base?.invalidation ?? 'Noch keine Invalidierung dokumentiert.',
    mistakes: row?.mistakes?.length ? row.mistakes : base?.mistakes ?? ['Noch keine typischen Fehler gesammelt.'],
    checklist: row?.checklist?.length ? row.checklist : base?.checklist ?? [],
    playbook: row?.playbook ?? base?.playbook ?? undefined,
    performance:
      linkedTrades.length > 0
        ? `${formatCurrency(metrics.netPnL)} · ${metrics.winRate.toFixed(0)}% Winrate · ${formatRMultiple(metrics.averageR)}`
        : (base?.performance ?? 'Noch keine Performance-Daten vorhanden.'),
    bestMarket,
    bestSession,
    coverImage,
    exampleImages: imageItems.map((item) => item.url),
    exampleImageItems: imageItems,
  }
}
