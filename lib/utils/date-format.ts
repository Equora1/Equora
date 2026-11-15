import type { JournalLocale } from '@/lib/i18n/journal'
import { getTradeDateKey } from '@/lib/utils/trade-time'

const shortMonths = {
  de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

export function formatTradeDateLabel(dateInput: string | Date, locale: JournalLocale = 'de') {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput

  if (Number.isNaN(date.getTime())) {
    return `01 ${shortMonths[locale][2]} 2026`
  }

  const [year, month, day] = getTradeDateKey(date.toISOString())!.split('-')
  return `${day} ${shortMonths[locale][Number(month) - 1]} ${year}`
}

