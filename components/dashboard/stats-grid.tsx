import { FuturisticCard } from '@/components/ui/futuristic-card'

type StatItem = {
  label: string
  value: string
  hint: string
  tone?: 'gold' | 'positive' | 'negative' | 'neutral'
}

export function StatsGrid({ items }: { items: readonly StatItem[] }) {
  return (
    <div className={`grid gap-3 ${items.length === 3 ? 'sm:grid-cols-[minmax(0,1.25fr)_repeat(2,minmax(0,1fr))]' : 'sm:grid-cols-2'}`}>
      {items.map((item, index) => (
        <FuturisticCard
          key={item.label}
          glow={index === 0 ? 'orange' : 'none'}
          className="min-w-0 p-4 sm:p-5"
        >
          <dl>
            <dt className="text-sm text-white/70">{item.label}</dt>
            <dd className={`mt-1 break-words text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.85rem] ${toneText(item.tone)}`}>{item.value}</dd>
            <dd className="mt-1 text-xs leading-5 text-white/60">{item.hint}</dd>
          </dl>
        </FuturisticCard>
      ))}
    </div>
  )
}

function toneText(tone: StatItem['tone']) {
  if (tone === 'positive') return 'text-emerald-300'
  if (tone === 'negative') return 'text-red-300'
  if (tone === 'gold') return 'text-[#f3bd7f]'
  return 'text-white'
}

