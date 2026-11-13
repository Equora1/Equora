'use client'

import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { CompareDimension } from '@/lib/utils/compare'

const options: { label: string; en: string; value: CompareDimension }[] = [
  { label: 'Setup', en: 'Setup', value: 'setup' },
  { label: 'Session', en: 'Session', value: 'session' },
  { label: 'Emotion', en: 'Emotion', value: 'emotion' },
  { label: 'Markt', en: 'Market', value: 'market' },
  { label: 'Qualität', en: 'Quality', value: 'quality' },
  { label: 'Konzept', en: 'Concept', value: 'concept' },
  { label: 'Tags', en: 'Tags', value: 'tag' },
]

export function CompareControl({ value, onChange, locale = 'de' }: { value: CompareDimension; onChange: (value: CompareDimension) => void; locale?: JournalLocale }) {
  const text = journalText(locale)
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isActive = value === option.value
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              isActive
                ? 'border-orange-400/25 bg-orange-400/12 text-orange-100 shadow-[0_0_16px_rgba(251,146,60,0.18)]'
                : 'border-white/10 bg-black/20 text-white/60 hover:border-white/14 hover:text-white/75'
            }`}
          >
            {text(option.label, option.en)}
          </button>
        )
      })}
    </div>
  )
}
