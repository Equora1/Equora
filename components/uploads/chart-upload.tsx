'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export function ChartUpload({
  label = 'Screenshot / Chartbild',
  onFileSelect,
}: {
  label?: string
  onFileSelect?: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filename, setFilename] = useState('')

  const previewUrl = useMemo(() => {
    if (!selectedFile) return null
    return URL.createObjectURL(selectedFile)
  }, [selectedFile])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleFile(file: File | null) {
    setSelectedFile(file)
    setFilename(file?.name ?? '')
    onFileSelect?.(file)
  }

  return (
    <div className="rounded-2xl border border-orange-400/15 bg-black/40 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-4 flex h-40 w-full items-center justify-center rounded-3xl border border-dashed border-orange-400/20 bg-gradient-to-br from-orange-400/10 to-transparent text-sm text-white/40"
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Chart Preview" className="h-full w-full rounded-3xl object-cover" />
        ) : (
          'Chart-Screenshot auswählen'
        )}
      </button>

      <div className="mt-3 flex items-center justify-between text-xs text-white/45">
        <span>{filename || 'Noch keine Datei gewählt'}</span>
        <span>PNG / JPG / WEBP</span>
      </div>
    </div>
  )
}
