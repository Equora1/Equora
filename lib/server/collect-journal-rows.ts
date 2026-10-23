export type JournalRowPage<T> = {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

// Exact counts and stable ID ordering are supplied by the owner-scoped reader.
// Short API pages are continued; a failed/incomplete read never becomes success.
export async function collectJournalRows<T extends { id: string }>(
  fetchPage: (from: number, to: number) => PromiseLike<JournalRowPage<T>>,
  maxRows: number,
  pageSize = 500,
): Promise<T[]> {
  if (!Number.isSafeInteger(maxRows) || maxRows < 0 || !Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error('JOURNAL_READ_OPTIONS_INVALID')
  const rows: T[] = []
  const ids = new Set<string>()
  let expected: number | undefined
  for (;;) {
    const response = await fetchPage(rows.length, rows.length + pageSize - 1)
    if (response.error || !Array.isArray(response.data)) throw new Error('JOURNAL_READ_FAILED')
    if (!Number.isSafeInteger(response.count) || response.count === null || response.count < 0) throw new Error('JOURNAL_COUNT_UNAVAILABLE')
    if (response.count > maxRows) throw new Error('JOURNAL_READ_LIMIT_EXCEEDED')
    if (expected !== undefined && expected !== response.count) throw new Error('JOURNAL_CHANGED_DURING_READ')
    expected = response.count
    if (response.data.length > pageSize || rows.length + response.data.length > expected) throw new Error('JOURNAL_READ_INCONSISTENT')
    for (const row of response.data) {
      if (!row.id || ids.has(row.id)) throw new Error('JOURNAL_READ_DUPLICATE_ID')
      ids.add(row.id)
      rows.push(row)
    }
    if (!response.data.length) {
      if (rows.length !== expected) throw new Error('JOURNAL_READ_INCOMPLETE')
      return rows
    }
    // One empty tail read also confirms the final count and end of the result.
  }
}
