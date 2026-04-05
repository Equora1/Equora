'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from 'react'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'

type PreviewItem = {
  file: File
  url: string
}

export function ChartUploadAdvanced({
  label = 'Screenshots / Chartbilder',
  multiple = true,
  onFilesChange,
}: {
  label?: string
  multiple?: boolean
  onFilesChange?: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)

  const previews = useMemo<PreviewItem[]>(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files])

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [previews])

  const updateFiles = useCallback(
    (incoming: File[]) => {
      setFiles((prev) => {
        const next = multiple ? [...prev, ...incoming] : incoming.slice(0, 1)
        onFilesChange?.(next)
        return next
      })
    },
    [multiple, onFilesChange]
  )

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items
      if (!items) return

      const pastedFiles: File[] = []
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) pastedFiles.push(file)
        }
      }

      if (pastedFiles.length > 0) updateFiles(pastedFiles)
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [updateFiles])

  function handleSelect(fileList: FileList | null) {
    if (!fileList) return
    updateFiles(Array.from(fileList))
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index)
      onFilesChange?.(next)
      return next
    })
  }

  return (
    <div className="rounded-2xl border border-orange-400/15 bg-black/40 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(event: ChangeEvent<HTMLInputElement>) => handleSelect(event.target.files)}
      />

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          setDragActive(false)
          handleSelect(event.dataTransfer.files)
        }}
        className={`mt-4 flex min-h-40 cursor-pointer items-center justify-center rounded-3xl border border-dashed px-4 py-8 text-center text-sm transition ${
          dragActive
            ? 'border-orange-400/40 bg-orange-400/10 text-orange-100/90'
            : 'border-orange-400/20 bg-gradient-to-br from-orange-400/10 to-transparent text-white/40'
        }`}
      >
        <div>
          <p>Datei ziehen, klicken oder mit Strg+V Screenshot einfügen</p>
          <p className="mt-2 text-xs text-white/35">PNG / JPG / WEBP</p>
        </div>
      </div>

      {previews.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {previews.map((preview, index) => (
            <div key={`${preview.file.name}-${index}`} className="rounded-2xl border border-orange-400/15 bg-white/5 p-2">
              <SetupImageLightbox
                src={preview.url}
                alt={preview.file.name}
                badge="Trade-Medium"
                hint="Klick für Großansicht"
                className="rounded-xl"
                imageClassName="h-28 w-full rounded-xl object-cover"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-white/55">{preview.file.name}</span>
                <button
                  type="button"
                  onClick={(event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation()
                    removeFile(index)
                  }}
                  className="rounded-full border border-red-400/20 bg-red-400/10 px-2 py-1 text-[10px] text-red-300"
                >
                  Entfernen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
