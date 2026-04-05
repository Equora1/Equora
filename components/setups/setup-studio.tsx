'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type DragEvent } from 'react'
import { deleteSetupEntry, saveSetupEntry } from '@/app/actions/setups'
import { uploadSetupImages } from '@/lib/supabase/storage'
import type { SavedSetup, SavedSetupMedia, SetupImageRole } from '@/lib/types/setup'

type DraftSetupMedia = SavedSetupMedia & {
  tempId: string
  previewUrl: string
  file?: File
  persisted: boolean
}

type DraftSetup = {
  id?: string | null
  title: string
  category: string
  description: string
  playbook: string
  checklist: string
  mistakes: string
  isArchived: boolean
  sortOrder: number
  media: DraftSetupMedia[]
}

const defaultCategories = ['SMC', 'Breakout', 'Price Action', 'Momentum', 'Mean Reversion', 'Trend', 'Custom']
const mediaRoleOptions: Array<{ value: SetupImageRole; label: string }> = [
  { value: 'example', label: 'Beispiel' },
  { value: 'best-practice', label: 'Best Practice' },
  { value: 'mistake', label: 'Fehlerbeispiel' },
]

function uniqueId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function arrayToText(values: string[] = []) {
  return values.join('\n')
}

function textToArray(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function buildDraft(setup?: SavedSetup | null): DraftSetup {
  if (!setup) {
    return {
      id: null,
      title: '',
      category: 'SMC',
      description: '',
      playbook: '',
      checklist: '',
      mistakes: '',
      isArchived: false,
      sortOrder: 0,
      media: [],
    }
  }

  return {
    id: setup.id,
    title: setup.title,
    category: setup.category?.trim() || 'SMC',
    description: setup.description ?? '',
    playbook: setup.playbook ?? '',
    checklist: arrayToText(setup.checklist),
    mistakes: arrayToText(setup.mistakes),
    isArchived: setup.isArchived,
    sortOrder: setup.sortOrder,
    media: setup.media.map((item, index) => ({
      ...item,
      tempId: item.id ?? uniqueId(`media-${index}`),
      previewUrl: item.publicUrl,
      persisted: true,
    })),
  }
}

function bytesToLabel(value?: number | null) {
  if (!value) return 'Datei'
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function SetupStudio({ initialSetups, source }: { initialSetups: SavedSetup[]; source: 'supabase' | 'mock' }) {
  const [setups, setSetups] = useState(initialSetups)
  const [selectedId, setSelectedId] = useState<string | null>(initialSetups[0]?.id ?? null)
  const [draft, setDraft] = useState<DraftSetup>(buildDraft(initialSetups[0]))
  const [status, setStatus] = useState(source === 'mock' ? 'Demo-Modus: Für echtes Speichern bitte Supabase verbinden.' : '')
  const [removedStoragePaths, setRemovedStoragePaths] = useState<string[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setSetups(initialSetups)
    if (!initialSetups.length) {
      setSelectedId(null)
      setDraft(buildDraft(null))
      return
    }
    if (!selectedId || !initialSetups.some((setup) => setup.id === selectedId)) {
      setSelectedId(initialSetups[0].id)
      setDraft(buildDraft(initialSetups[0]))
    }
  }, [initialSetups, selectedId])

  const orderedSetups = useMemo(
    () => [...setups].sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'de')),
    [setups],
  )

  function applyDraft(update: Partial<DraftSetup>) {
    setDraft((current) => ({ ...current, ...update }))
  }

  function selectSetup(setupId: string | null) {
    setSelectedId(setupId)
    setRemovedStoragePaths([])
    setDraft(buildDraft(orderedSetups.find((setup) => setup.id === setupId) ?? null))
  }

  function handleFiles(files: File[]) {
    if (!files.length) return
    setDraft((current) => {
      const existingCount = current.media.length
      const nextMedia = files
        .filter((file) => file.type.startsWith('image/'))
        .map((file, index) => ({
          tempId: uniqueId('pending-media'),
          storagePath: '',
          publicUrl: '',
          previewUrl: URL.createObjectURL(file),
          fileName: file.name,
          mimeType: file.type || null,
          byteSize: Number.isFinite(file.size) ? file.size : null,
          sortOrder: existingCount + index,
          isCover: existingCount === 0 && index === 0,
          caption: '',
          mediaRole: 'example' as const,
          file,
          persisted: false,
        }))
      return {
        ...current,
        media: [...current.media, ...nextMedia].map((item, index) => ({ ...item, sortOrder: index, isCover: item.isCover || (!current.media.some((candidate) => candidate.isCover) && index === 0) })),
      }
    })
    setStatus(`${files.length} Bild${files.length === 1 ? '' : 'er'} bereit zum Speichern.`)
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    handleFiles(Array.from(event.dataTransfer.files ?? []))
  }

  function updateMedia(tempId: string, updater: (item: DraftSetupMedia) => DraftSetupMedia) {
    setDraft((current) => ({
      ...current,
      media: current.media.map((item) => (item.tempId === tempId ? updater(item) : item)),
    }))
  }

  function moveMedia(tempId: string, direction: -1 | 1) {
    setDraft((current) => {
      const index = current.media.findIndex((item) => item.tempId === tempId)
      if (index < 0) return current
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.media.length) return current
      const nextMedia = [...current.media]
      const [item] = nextMedia.splice(index, 1)
      nextMedia.splice(nextIndex, 0, item)
      return {
        ...current,
        media: nextMedia.map((mediaItem, itemIndex) => ({ ...mediaItem, sortOrder: itemIndex })),
      }
    })
  }

  function markAsCover(tempId: string) {
    setDraft((current) => ({
      ...current,
      media: current.media.map((item) => ({ ...item, isCover: item.tempId === tempId })),
    }))
  }

  function removeMedia(tempId: string) {
    setDraft((current) => {
      const target = current.media.find((item) => item.tempId === tempId)
      if (target?.persisted && target.storagePath) {
        setRemovedStoragePaths((existing) => Array.from(new Set([...existing, target.storagePath])))
      }
      const nextMedia = current.media.filter((item) => item.tempId !== tempId)
      return {
        ...current,
        media: nextMedia.map((item, index) => ({ ...item, sortOrder: index, isCover: item.isCover || (!nextMedia.some((candidate) => candidate.isCover) && index === 0) })),
      }
    })
  }

  function handleSave() {
    startTransition(async () => {
      setStatus('Setup wird gespeichert …')
      const persistedMedia = draft.media
        .filter((item) => item.persisted && item.storagePath)
        .map<SavedSetupMedia>((item, index) => ({
          storagePath: item.storagePath,
          publicUrl: item.publicUrl,
          fileName: item.fileName,
          mimeType: item.mimeType,
          byteSize: item.byteSize,
          sortOrder: index,
          isCover: item.isCover,
          caption: item.caption,
          mediaRole: item.mediaRole,
        }))

      const firstSave = await saveSetupEntry({
        id: draft.id,
        title: draft.title,
        category: draft.category,
        description: draft.description,
        playbook: draft.playbook,
        checklist: textToArray(draft.checklist),
        mistakes: textToArray(draft.mistakes),
        isArchived: draft.isArchived,
        sortOrder: draft.sortOrder,
        media: persistedMedia,
        removedStoragePaths,
      })

      if (!firstSave.success || !firstSave.setupId) {
        setStatus(firstSave.message)
        return
      }

      const pendingItems = draft.media.filter((item) => !item.persisted && item.file)
      if (pendingItems.length && firstSave.mode === 'supabase') {
        try {
          const uploaded = await uploadSetupImages(firstSave.setupId, pendingItems.map((item) => item.file as File))
          let uploadIndex = 0
          const combinedMedia = draft.media.map<SavedSetupMedia>((item, index) => {
            if (!item.persisted && item.file) {
              const uploadedItem = uploaded[uploadIndex++]
              return {
                storagePath: uploadedItem.storagePath,
                publicUrl: uploadedItem.publicUrl,
                fileName: uploadedItem.fileName,
                mimeType: uploadedItem.mimeType,
                byteSize: uploadedItem.byteSize,
                sortOrder: index,
                isCover: item.isCover,
                caption: item.caption,
                mediaRole: item.mediaRole,
              }
            }

            return {
              storagePath: item.storagePath,
              publicUrl: item.publicUrl,
              fileName: item.fileName,
              mimeType: item.mimeType,
              byteSize: item.byteSize,
              sortOrder: index,
              isCover: item.isCover,
              caption: item.caption,
              mediaRole: item.mediaRole,
            }
          })

          const secondSave = await saveSetupEntry({
            id: firstSave.setupId,
            title: draft.title,
            category: draft.category,
            description: draft.description,
            playbook: draft.playbook,
            checklist: textToArray(draft.checklist),
            mistakes: textToArray(draft.mistakes),
            isArchived: draft.isArchived,
            sortOrder: draft.sortOrder,
            media: combinedMedia,
            removedStoragePaths: [],
          })

          if (!secondSave.success || !secondSave.setup) {
            setStatus(secondSave.message)
            return
          }

          setSetups((current) => {
            const rest = current.filter((item) => item.id !== secondSave.setup?.id)
            return [...rest, secondSave.setup]
          })
          setSelectedId(secondSave.setup.id)
          setDraft(buildDraft(secondSave.setup))
          setRemovedStoragePaths([])
          setStatus(secondSave.message)
          return
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Bild-Upload fehlgeschlagen.')
          return
        }
      }

      if (firstSave.setup) {
        setSetups((current) => {
          const rest = current.filter((item) => item.id !== firstSave.setup?.id)
          return [...rest, firstSave.setup]
        })
        setSelectedId(firstSave.setup.id)
        setDraft(buildDraft(firstSave.setup))
        setRemovedStoragePaths([])
      }
      setStatus(firstSave.message)
    })
  }

  function handleDelete() {
    if (!draft.id) {
      selectSetup(null)
      setStatus('Neues Setup verworfen.')
      return
    }

    const confirmed = window.confirm(`Setup „${draft.title}“ wirklich löschen?`)
    if (!confirmed) return

    startTransition(async () => {
      const result = await deleteSetupEntry(draft.id as string)
      setStatus(result.message)
      if (!result.success) return
      const remaining = orderedSetups.filter((setup) => setup.id !== draft.id)
      setSetups(remaining)
      setSelectedId(remaining[0]?.id ?? null)
      setDraft(buildDraft(remaining[0] ?? null))
      setRemovedStoragePaths([])
    })
  }

  return (
    <section className="rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="mb-6 rounded-3xl border border-orange-400/15 bg-orange-400/[0.05] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/45">Setup Studio</p>
            <h2 className="mt-2 text-2xl font-semibold text-orange-300">Simple Setup Flow mit Details auf Abruf</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Erst Name, Bild und ein klarer Satz. Alles Weitere bleibt im Hintergrund, bis das Setup als Grundgerüst steht.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StudioMetric label="Setups" value={String(orderedSetups.length)} />
            <StudioMetric label="Bilder" value={String(orderedSetups.reduce((sum, setup) => sum + setup.media.length, 0))} />
            <StudioMetric label="Modus" value={source === 'supabase' ? 'Live' : 'Demo'} />
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-white">{draft.title?.trim() ? draft.title : 'Neues Setup'}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            {draft.description?.trim() || 'Lege zuerst Name, optional ein Bild und den Kern des Setups fest. Details kannst du später ergänzen.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => selectSetup(null)}
            className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white"
          >
            Neues Setup
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200 transition hover:border-emerald-400/35 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? 'Speichert …' : 'Setup speichern'}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.32fr_0.68fr]">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">Setup-Landschaft</p>
            <p className="mt-2 text-sm text-white">{orderedSetups.length} gespeicherte Setups</p>
            <p className="mt-1 text-xs leading-5 text-white/45">Wähle links den Kandidaten, den du gerade schärfen willst. Archivierte Setups bleiben sichtbar, aber stehen nicht im Vordergrund.</p>
          </div>

          <div className="space-y-2">
            {orderedSetups.length ? (
              orderedSetups.map((setup) => (
                <button
                  key={setup.id}
                  type="button"
                  onClick={() => selectSetup(setup.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    selectedId === setup.id
                      ? 'border-orange-400/25 bg-orange-400/10 shadow-[0_0_18px_rgba(251,146,60,0.10)]'
                      : 'border-white/8 bg-white/[0.03] hover:border-white/16 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{setup.title}</p>
                      <p className="mt-1 text-xs text-white/45">{setup.category || 'Custom'} · {setup.media.length} Bild{setup.media.length === 1 ? '' : 'er'}</p>
                    </div>
                    {setup.isArchived ? <span className="rounded-full border border-red-400/15 bg-red-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-red-200/80">Archiv</span> : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/58">{setup.description || 'Noch keine Beschreibung hinterlegt.'}</p>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-white/55">
                Noch keine persönlichen Setups gespeichert. Starte mit dem Namen deines ersten Setups und ergänze Bilder oder Details später.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">Arbeitsfläche</p>
            <p className="mt-2 text-sm text-white">Starte mit dem schnellsten Kernfluss: Name, Bild, ein Satz, speichern.</p>
            <p className="mt-1 text-xs leading-5 text-white/45">Playbook, Checkliste, Fehlerliste und Archiv-Status bleiben da, aber nicht mehr im ersten Blickfeld.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-white/40">Setup Name</span>
              <input value={draft.title} onChange={(event) => applyDraft({ title: event.target.value })} placeholder="z. B. NY Sweep + Reclaim" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400/30" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-white/40">Kategorie später oder jetzt</span>
              <input list="setup-categories" value={draft.category} onChange={(event) => applyDraft({ category: event.target.value })} placeholder="SMC, Breakout, Momentum …" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400/30" />
              <datalist id="setup-categories">{defaultCategories.map((option) => <option key={option} value={option} />)}</datalist>
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-white/40">Ein Satz zum Setup</span>
            <textarea value={draft.description} onChange={(event) => applyDraft({ description: event.target.value })} rows={3} placeholder="Was ist der Kern dieses Setups?" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
          </label>

          <details className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-white">Details später ergänzen</summary>
            <p className="mt-2 text-xs leading-5 text-white/45">Playbook, Checkliste und typische Fehler werden erst wichtig, wenn das Grundgerüst steht.</p>

            <div className="mt-4 space-y-4">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-white/40">Playbook / Ablauf</span>
                <textarea value={draft.playbook} onChange={(event) => applyDraft({ playbook: event.target.value })} rows={4} placeholder="Wann ist das Setup gültig, was ist der Trigger, wo liegt die Invalidierung?" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.22em] text-white/40">Checklist (eine Zeile pro Punkt)</span>
                  <textarea value={draft.checklist} onChange={(event) => applyDraft({ checklist: event.target.value })} rows={5} placeholder={`HTF Bias stimmt\nTrigger bestätigt\nRR passt`} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.22em] text-white/40">Typische Fehler (eine Zeile pro Punkt)</span>
                  <textarea value={draft.mistakes} onChange={(event) => applyDraft({ mistakes: event.target.value })} rows={5} placeholder={`zu früher Entry\nkein Kontext\nEntry gechased`} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <label className="flex items-center gap-3 text-sm text-white/70">
                  <input type="checkbox" checked={draft.isArchived} onChange={(event) => applyDraft({ isArchived: event.target.checked })} className="h-4 w-4 rounded border-white/20 bg-black/40 text-orange-400 focus:ring-orange-400/30" />
                  Setup archivieren, aber im Journal behalten
                </label>
                <button type="button" onClick={handleDelete} className="rounded-full border border-red-400/15 bg-red-400/10 px-4 py-2 text-sm text-red-200/85 transition hover:border-red-400/30 hover:bg-red-400/15">{draft.id ? 'Setup löschen' : 'Entwurf verwerfen'}</button>
              </div>
            </div>
          </details>

          <div className="space-y-3 rounded-3xl border border-emerald-400/15 bg-emerald-400/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-emerald-100">Setup Media</p>
                <p className="text-xs text-emerald-100/65">Drag & Drop oder Dateiauswahl. Mehrere Bilder gleichzeitig sind okay.</p>
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-full border border-emerald-400/20 bg-black/25 px-4 py-2 text-sm text-emerald-100 transition hover:border-emerald-400/35 hover:bg-black/35">Bilder wählen</button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={onFileChange} />
            <div
              onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
              onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
              onDragLeave={(event) => { event.preventDefault(); setDragActive(false) }}
              onDrop={onDrop}
              className={`rounded-3xl border border-dashed px-5 py-8 text-center transition ${dragActive ? 'border-emerald-400/45 bg-emerald-400/10' : 'border-white/12 bg-black/20'}`}
            >
              <p className="text-sm text-white/75">Bilder hier hineinziehen</p>
              <p className="mt-2 text-xs text-white/45">Ideal für echte Chart-Screenshots, Best-Practice-Beispiele und Fehlerbeispiele.</p>
            </div>

            {draft.media.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {draft.media.map((item, index) => (
                  <div key={item.tempId} className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
                    <div className="relative">
                      <img src={item.previewUrl} alt={item.fileName ?? `Setup Media ${index + 1}`} className="h-40 w-full object-cover" />
                      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                        {item.isCover ? <span className="rounded-full border border-orange-400/20 bg-orange-400/90 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-black">Cover</span> : null}
                        {!item.persisted ? <span className="rounded-full border border-white/15 bg-black/50 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80">Neu</span> : null}
                      </div>
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-3 text-xs text-white/45">
                        <span className="truncate">{item.fileName ?? 'Bild'}</span>
                        <span>{bytesToLabel(item.byteSize)}</span>
                      </div>
                      <label className="space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Typ</span>
                        <select value={item.mediaRole ?? 'example'} onChange={(event) => updateMedia(item.tempId, (current) => ({ ...current, mediaRole: event.target.value as SetupImageRole }))} className="w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none transition focus:border-orange-400/30">
                          {mediaRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Kommentar</span>
                        <textarea value={item.caption ?? ''} onChange={(event) => updateMedia(item.tempId, (current) => ({ ...current, caption: event.target.value }))} rows={3} placeholder="Worauf soll der Nutzer hier achten?" className="w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => markAsCover(item.tempId)} className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/85 transition hover:border-orange-400/35">Als Cover</button>
                        <button type="button" onClick={() => moveMedia(item.tempId, -1)} disabled={index === 0} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75 transition hover:border-white/18 disabled:opacity-40">Hoch</button>
                        <button type="button" onClick={() => moveMedia(item.tempId, 1)} disabled={index === draft.media.length - 1} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75 transition hover:border-white/18 disabled:opacity-40">Runter</button>
                        <button type="button" onClick={() => removeMedia(item.tempId)} className="rounded-full border border-red-400/15 bg-red-400/10 px-3 py-1.5 text-xs text-red-200/85 transition hover:border-red-400/30">Entfernen</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/55">
                Noch keine Setup-Bilder hinterlegt. Du kannst später echte Charts, Fehlerbeispiele und Best-Practice-Screenshots ergänzen.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/65">{status || 'Bereit für dein nächstes Setup.'}</div>
        </div>
      </div>
    </section>
  )
}


function StudioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  )
}
