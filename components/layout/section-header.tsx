type SectionHeaderProps = {
  eyebrow: string
  title: string
  copy?: string
  badge?: string
}

export function SectionHeader({ eyebrow, title, badge }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-[24px] border border-white/8 bg-white/[0.02] px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[#998a72]">{eyebrow}</p>
        <h2 className="eq-display mt-2 text-2xl text-white">{title}</h2>
      </div>

      {badge ? (
        <div className="self-start rounded-full border border-[#c8823a]/25 bg-[#c8823a]/10 px-3 py-1.5 text-xs text-[#f0a855] md:self-auto">
          {badge}
        </div>
      ) : null}
    </div>
  )
}
