import type { AriaRole, ReactNode } from 'react'

type FuturisticCardProps = {
  children: ReactNode
  className?: string
  glow?: 'orange' | 'emerald' | 'red' | 'none'
  role?: AriaRole
}

export function FuturisticCard({ children, className = '', glow = 'none', role }: FuturisticCardProps) {
  const glowClass =
    glow === 'orange'
      ? 'before:bg-[radial-gradient(circle_at_top_right,rgba(240,168,85,0.13),transparent_48%)] shadow-[0_18px_55px_rgba(0,0,0,0.42),0_0_26px_rgba(200,130,58,0.10)]'
      : glow === 'emerald'
        ? 'before:bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.09),transparent_52%)] shadow-[0_18px_55px_rgba(0,0,0,0.40)]'
        : glow === 'red'
          ? 'before:bg-[radial-gradient(circle_at_top_right,rgba(229,72,77,0.10),transparent_48%)] shadow-[0_18px_55px_rgba(0,0,0,0.40)]'
          : 'before:bg-[linear-gradient(180deg,rgba(255,255,255,0.018),transparent_42%)] shadow-[0_18px_55px_rgba(0,0,0,0.38)]'

  return (
    <div
      role={role}
      className={`relative overflow-hidden rounded-[1rem] border border-white/[0.07] bg-[#0d0d0e]/95 backdrop-blur-xl before:absolute before:inset-0 before:pointer-events-none ${glowClass} ${className}`}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(240,168,85,0.25),transparent)]" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
