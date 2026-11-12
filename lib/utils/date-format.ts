import { getTradeDateKey } from '@/lib/utils/trade-time'

const shortGermanMonths = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export function formatTradeDateLabel(dateInput: string | Date) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput

  if (Number.isNaN(date.getTime())) {
    return '01 Mär 2026'
  }

  const [year, month, day] = getTradeDateKey(date.toISOString())!.split('-')
  return `${day} ${shortGermanMonths[Number(month) - 1]} ${year}`
}

