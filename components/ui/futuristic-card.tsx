import { ReactNode } from 'react'

type FuturisticCardProps = {
  children: ReactNode
  className?: string
  glow?: 'orange' | 'emerald' | 'red' | 'none'
}

export function FuturisticCard({ children, className = '', glow = 'none' }: FuturisticCardProps) {
  const glowClass =
    glow === 'orange'
      ? 'before:bg-[radial-gradient(circle_at_top,rgba(240,168,85,0.18),transparent_50%)] shadow-[0_0_30px_rgba(200,130,58,0.22),0_24px_64px_rgba(0,0,0,0.46)]'
      : glow === 'emerald'
        ? 'before:bg-[radial-gradient(circle_at_top,rgba(240,168,85,0.12),transparent_54%)] shadow-[0_0_24px_rgba(200,130,58,0.12),0_24px_64px_rgba(0,0,0,0.44)]'
        : glow === 'red'
          ? 'before:bg-[radial-gradient(circle_at_top,rgba(229,72,77,0.14),transparent_46%)] shadow-[0_24px_64px_rgba(0,0,0,0.44)]'
          : 'before:bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_42%)] shadow-[0_24px_64px_rgba(0,0,0,0.42)]'

  return (
    <div
      className={`relative overflow-hidden rounded-[1.1rem] border border-[#221e1a] bg-[#0d0d0d]/95 backdrop-blur-xl before:absolute before:inset-0 before:pointer-events-none ${glowClass} ${className}`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_36%)]" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
