import { FuturisticCard } from '@/components/ui/futuristic-card'

type StatItem = {
  label: string
  value: string
  hint: string
  tone?: 'gold' | 'positive' | 'negative' | 'neutral'
}

export function StatsGrid({ items }: { items: readonly StatItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
      {items.map((item, index) => (
        <FuturisticCard
          key={item.label}
          glow={index === 0 ? 'orange' : 'none'}
          className={[
            'min-h-[132px] p-4 sm:min-h-[144px] xl:min-h-[150px]',
            index === 0 ? 'sm:col-span-2 xl:col-span-4' : 'xl:col-span-2',
          ].join(' ')}
        >
          <div className="flex h-full flex-col justify-between gap-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/60">{item.label}</p>
              <span className={`h-1.5 w-1.5 rounded-full ${toneDot(item.tone)}`} />
            </div>
            <div>
              <p className={`text-3xl font-semibold tracking-[-0.04em] tabular-nums sm:text-[2rem] ${toneText(item.tone)}`}>{item.value}</p>
              <p className="mt-2 max-w-[25ch] text-xs leading-5 text-white/60">{item.hint}</p>
            </div>
          </div>
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

function toneDot(tone: StatItem['tone']) {
  if (tone === 'positive') return 'bg-emerald-300'
  if (tone === 'negative') return 'bg-red-300'
  if (tone === 'gold') return 'bg-[#f0a855]'
  return 'bg-white/25'
}
