const shortGermanMonths = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export function formatTradeDateLabel(dateInput: string | Date) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput

  if (Number.isNaN(date.getTime())) {
    return '01 Mär 2026'
  }

  return `${String(date.getDate()).padStart(2, '0')} ${shortGermanMonths[date.getMonth()]} ${date.getFullYear()}`
}
