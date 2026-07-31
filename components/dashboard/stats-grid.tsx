import { FuturisticCard } from '@/components/ui/futuristic-card'

type StatItem = {
  label: string
  value: string
  hint: string
}

export function StatsGrid({ items }: { items: StatItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
      {items.map((item, index) => (
        <FuturisticCard
          key={item.label}
          glow={index === 0 ? 'orange' : index === items.length - 1 ? 'emerald' : 'none'}
          className={[
            'min-h-[132px] p-4 sm:min-h-[144px] xl:min-h-[156px]',
            index === 0 ? 'sm:col-span-2 xl:col-span-4' : 'xl:col-span-2',
          ].join(' ')}
        >
          <div className="flex h-full flex-col justify-between gap-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-white/38">{item.label}</p>
            <div>
              <p className="text-3xl font-semibold tracking-tight text-white sm:text-[2rem]">{item.value}</p>
              <p className="mt-2 max-w-[22ch] text-sm leading-6 text-white/48">{item.hint}</p>
            </div>
          </div>
        </FuturisticCard>
      ))}
    </div>
  )
}
