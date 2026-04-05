import type { SVGProps } from 'react'

export type AppIconName =
  | 'dashboard'
  | 'trades'
  | 'setups'
  | 'review'
  | 'stats'
  | 'vault'
  | 'note'
  | 'sessions'
  | 'cost'
  | 'calendar'
  | 'logout'
  | 'spark'
  | 'playbook'
  | 'scan'
  | 'focus'
  | 'arrow'

const common = 'h-4 w-4'

export function AppIcon({ name, className, ...props }: { name: AppIconName } & SVGProps<SVGSVGElement>) {
  const resolvedClassName = className ? `${common} ${className}` : common

  if (name === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <rect x="4" y="4" width="7" height="7" rx="1.8" />
        <rect x="13" y="4" width="7" height="4" rx="1.8" />
        <rect x="13" y="10" width="7" height="10" rx="1.8" />
        <rect x="4" y="13" width="7" height="7" rx="1.8" />
      </svg>
    )
  }

  if (name === 'trades') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M4 17l5-5 4 4 7-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 8h5v5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'setups' || name === 'playbook') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M6 4.5h9.5L19 8v11.5H6z" strokeLinejoin="round" />
        <path d="M15.5 4.5V8H19" strokeLinejoin="round" />
        <path d="M9 12h7M9 15.5h5" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'review') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4.2-4.2" strokeLinecap="round" />
        <path d="M11 8.5v2.8l2 1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'stats') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M5 19V9" strokeLinecap="round" />
        <path d="M12 19V5" strokeLinecap="round" />
        <path d="M19 19v-7" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'vault') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8 10h8M8 14h5" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'note') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M6 4.5h12V19H6z" />
        <path d="M9 9h6M9 13h6M9 17h4" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'sessions') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M7 6h10" strokeLinecap="round" />
        <path d="M7 12h10" strokeLinecap="round" />
        <path d="M7 18h6" strokeLinecap="round" />
        <circle cx="18" cy="18" r="2" />
      </svg>
    )
  }

  if (name === 'cost') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M12 4v16" strokeLinecap="round" />
        <path d="M16.2 7.5c0-1.8-1.9-3-4.2-3s-4.2 1.2-4.2 3 1.6 2.6 4.2 3 4.2 1.2 4.2 3-1.9 3-4.2 3-4.2-1.2-4.2-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3.5V7M16 3.5V7M4 9.5h16" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'logout') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" strokeLinecap="round" />
        <path d="M14 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 12h9" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'spark') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'scan') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M8 4H6a2 2 0 0 0-2 2v2M16 4h2a2 2 0 0 1 2 2v2M8 20H6a2 2 0 0 1-2-2v-2M16 20h2a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
        <path d="M7 12h10" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'focus') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M12 4v3M12 17v3M4 12h3M17 12h3" strokeLinecap="round" />
        <circle cx="12" cy="12" r="4.5" />
      </svg>
    )
  }

  if (name === 'arrow') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
        <path d="M8 7l6 5-6 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={resolvedClassName} {...props}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}
