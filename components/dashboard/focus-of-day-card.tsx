import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { SectionHeader } from '@/components/layout/section-header'
import { getDashboardFocus, type FocusTone } from '@/lib/utils/dashboard-focus'

export function FocusOfDayCard({ trades, dailyNotes }: { trades: Trade[]; dailyNotes: DailyNoteRow[] }) {
  const focus = getDashboardFocus(trades, dailyNotes)

  return (
    <FuturisticCard glow="orange" className="p-5">
      <SectionHeader
        eyebrow="Fokus des Tages"
        title={focus.title}
        copy={focus.copy}
        badge={focus.badge}
      />

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {focus.answers.map((item) => (
          <div key={item.question} className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{item.question}</p>
            <p className={`mt-3 text-lg font-semibold ${getToneClass(item.tone)}`}>{item.answer}</p>
            <p className="mt-2 text-sm leading-6 text-white/58">{item.detail}</p>
          </div>
        ))}
      </div>
    </FuturisticCard>
  )
}

function getToneClass(tone: FocusTone) {
  switch (tone) {
    case 'emerald':
      return 'text-emerald-300'
    case 'orange':
      return 'text-orange-200'
    case 'red':
      return 'text-red-300'
    default:
      return 'text-white'
  }
}
