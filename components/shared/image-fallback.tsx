export function ImageFallback({ src, alt, fallback, className = '' }: { src?: string; alt: string; fallback: React.ReactNode; className?: string }) {
  if (!src) return <>{fallback}</>
  return <img src={src} alt={alt} className={className} />
}
