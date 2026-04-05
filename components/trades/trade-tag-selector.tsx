'use client'

const defaultTags = ['FOMO','Zu früh','News','Overtrade','Regelkonform','Geduldig','Chase','A-Setup','B-Setup','Impulsiv','Diszipliniert']

export function TradeTagSelector({ selectedTags, onChange, options = defaultTags }: { selectedTags: string[]; onChange: (tags: string[]) => void; options?: string[] }) {
  function toggleTag(tag: string) {
    if (selectedTags.includes(tag)) onChange(selectedTags.filter((item) => item !== tag))
    else onChange([...selectedTags, tag])
  }

  return (
    <div className="rounded-2xl border border-orange-400/15 bg-black/40 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/45">Trade Tags</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((tag) => {
          const isActive = selectedTags.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                isActive
                  ? 'border-orange-400/25 bg-orange-400/12 text-orange-100 shadow-[0_0_16px_rgba(251,146,60,0.18)]'
                  : 'border-white/10 bg-black/20 text-white/60 hover:border-white/14 hover:text-white/75'
              }`}
            >
              {tag}
            </button>
          )
        })}
      </div>
    </div>
  )
}
