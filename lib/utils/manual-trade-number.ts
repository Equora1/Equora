import { journalText, type JournalLocale } from '@/lib/i18n/journal'

export function parseManualTradeNumber(value: string | null | undefined, locale: JournalLocale): number | null {
  const input = value?.trim() ?? ''
  const normalized = locale === 'de' ? input.replace(',', '.') : input
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null

  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

export function getManualTradeNumberFormatHint(locale: JournalLocale): string {
  return journalText(locale)(
    'Ohne Tausendertrennzeichen eingeben, z. B. 1234,56 oder 1234.56.',
    'Use a decimal point and no thousands separators, e.g. 1234.56.',
  )
}
