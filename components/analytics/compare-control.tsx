'use client'

import type { CompareDimension } from '@/lib/utils/compare'

const options: { label: string; value: CompareDimension }[] = [
  { label: 'Setup', value: 'setup' },
  { label: 'Session', value: 'session' },
  { label: 'Emotion', value: 'emotion' },
  { label: 'Markt', value: 'market' },
  { label: 'Qualität', value: 'quality' },
  { label: 'Konzept', value: 'concept' },
  { label: 'Tags', value: 'tag' },
]

export function CompareControl({ value, onChange }: { value: CompareDimension; onChange: (value: CompareDimension) => void }) {
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
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
