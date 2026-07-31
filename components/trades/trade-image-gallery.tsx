'use client'

import { useMemo, useState, useTransition } from 'react'
import { removeTradeMediaItem } from '@/app/actions/trades'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'

type TradeImageGalleryProps = {
  images: { id: string; image_url: string }[]
  tradeId?: string
  source?: 'supabase' | 'mock'
}

export function TradeImageGallery({ images, tradeId, source = 'mock' }: TradeImageGalleryProps) {
  const [activeImages, setActiveImages] = useState(images)
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null)
  const [pendingImageId, setPendingImageId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canDelete = Boolean(tradeId)
  const statusTone = useMemo(() => {
    if (!status) return 'text-white/45'
    return status.ok ? 'text-emerald-300' : 'text-red-300'
  }, [status])

  function handleDelete(imageId: string, imageUrl: string) {
    if (!tradeId || source === 'mock') {
      setStatus({ text: source === 'mock' ? 'Demo-Modus: Bilder werden hier nicht wirklich gelöscht.' : 'Trade-ID fehlt zum Löschen des Bildes.', ok: false })
      return
    }

    startTransition(async () => {
      setPendingImageId(imageId)
      const result = await removeTradeMediaItem(tradeId, imageUrl)
      setPendingImageId(null)
      setStatus({ text: result.message, ok: result.success })
      if (result.success) {
        setActiveImages((current) => current.filter((image) => image.id !== imageId))
      }
    })
  }

  if (!activeImages.length) {
    return <div className="rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/55">Noch keine Screenshots vorhanden.</div>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-5">
        {activeImages.map((image, index) => {
          const isDeletingThis = pendingImageId === image.id && isPending
          return (
            <div key={image.id} className="overflow-hidden rounded-[30px] border border-orange-400/15 bg-black/35 p-3 shadow-[0_20px_48px_rgba(0,0,0,0.32)]">
              <div className="relative">
                <SetupImageLightbox
                  src={image.image_url}
                  alt={`Trade-Screenshot ${index + 1}`}
                  badge={`Trade-Screenshot ${index + 1}`}
                  hint="Klick für Großansicht"
                  className="rounded-[24px] border border-white/10 bg-black/45"
                  imageClassName="aspect-[16/6] w-full rounded-[24px] bg-[#050505] p-4 object-contain sm:aspect-[16/6] lg:aspect-[16/5]"
                  dialogClassName="max-w-[min(99vw,2200px)]"
                  dialogImageClassName="max-h-[96vh] w-full rounded-[1.75rem] object-contain"
                />
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(image.id, image.image_url)}
                    disabled={isPending}
                    aria-label={`Trade-Screenshot ${index + 1} löschen`}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/25 bg-black/70 text-red-100 transition hover:border-red-400/40 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeletingThis ? (
                      <span className="text-[10px]">…</span>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                        <path d="M5 7h14" strokeLinecap="round" />
                        <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" strokeLinecap="round" />
                        <path d="M8 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" strokeLinecap="round" />
                        <path d="M10 11v5M14 11v5" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      <p className={`text-xs ${statusTone}`}>
        {status?.text ?? (source === 'mock' ? 'Demo-Modus: Galerie ist sichtbar, Löschaktionen werden nicht persistiert.' : 'Galerie und Großansicht sind jetzt breiter, größer und näher an der Hauptvorschau aufgebaut.')}
      </p>
    </div>
  )
}
