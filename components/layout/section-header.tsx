type SectionHeaderProps = {
  eyebrow: string
  title: string
  copy: string
  badge?: string
}

export function SectionHeader({ eyebrow, title, copy, badge }: SectionHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/6 bg-white/[0.02] px-5 py-5 md:flex-row md:items-end md:justify-between xl:px-6">
      <div className="max-w-3xl">
        <p className="text-[10px] uppercase tracking-[0.35em] text-[#998a72]">{eyebrow}</p>
        <h2 className="eq-display eq-text-gradient mt-3 text-[1.9rem] leading-[0.95] sm:text-[2.15rem] xl:text-[2.45rem]">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#998a72] xl:text-[15px]">{copy}</p>
      </div>

      {badge ? (
        <div className="self-start rounded-full border border-[#c8823a]/25 bg-[#c8823a]/8 px-3 py-1.5 text-xs text-[#f0a855] shadow-[0_0_16px_rgba(200,130,58,0.12)] md:self-auto">
          {badge}
        </div>
      ) : null}
    </div>
  )
}
