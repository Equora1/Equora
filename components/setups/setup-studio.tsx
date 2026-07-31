'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type DragEvent } from 'react'
import { deleteSetupEntry, saveSetupEntry } from '@/app/actions/setups'
import { uploadSetupImages } from '@/lib/supabase/storage'
import type { SavedSetup, SavedSetupMedia, SetupImageRole } from '@/lib/types/setup'
import type { Trade } from '@/lib/types/trade'
import { SetupStudioToolbar } from '@/components/setups/setup-studio-toolbar'
import { SetupStudioSidebar } from '@/components/setups/setup-studio-sidebar'
import { SetupStudioEditor } from '@/components/setups/setup-studio-editor'
import { type DraftSetup, type DraftSetupMedia, type StudioView, type TradeLinkOption } from '@/components/setups/setup-studio-types'

type SetupMediaEditEventDetail = {
  setupId?: string | null
  copyAsOwn?: boolean
  title?: string
  category?: string
  description?: string
  entry?: string
  exit?: string
  invalidation?: string
  playbook?: string
  checklist?: string[]
  mistakes?: string[]
  media?: Array<{ url: string; caption?: string | null; mediaRole?: SetupImageRole | null; isCover?: boolean }>
}

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

function fileNameFromUrl(value: string) {
  const clean = value.split('?')[0].split('#')[0]
  return clean.split('/').filter(Boolean).pop() || 'setup-bild.png'
}

function buildTemplateMedia(items: SetupMediaEditEventDetail['media'] = []): DraftSetupMedia[] {
  return items
    .filter((item) => item.url?.trim())
    .map((item, index) => ({
      storagePath: `template/${fileNameFromUrl(item.url)}`,
      publicUrl: item.url,
      fileName: fileNameFromUrl(item.url),
      mimeType: item.url.endsWith('.webp') ? 'image/webp' : item.url.endsWith('.jpg') || item.url.endsWith('.jpeg') ? 'image/jpeg' : 'image/png',
      byteSize: null,
      sortOrder: index,
      isCover: Boolean(item.isCover ?? index === 0),
      caption: item.caption ?? null,
      mediaRole: item.mediaRole ?? 'example',
      tempId: uniqueId(`template-media-${index}`),
      previewUrl: item.url,
      persisted: true,
    }))
}

function buildDraft(setup?: SavedSetup | null): DraftSetup {
  if (!setup) {
    return {
      id: null,
      title: '',
      category: 'SMC',
      description: '',
      entry: '',
      exit: '',
      invalidation: '',
      playbook: '',
      checklist: '',
      mistakes: '',
      isArchived: false,
      isMaster: false,
      sortOrder: 0,
      media: [],
      linkedTradeIds: [],
    }
  }

  return {
    id: setup.id,
    title: setup.title,
    category: setup.category?.trim() || 'SMC',
    description: setup.description ?? '',
    entry: setup.entry ?? '',
    exit: setup.exit ?? '',
    invalidation: setup.invalidation ?? '',
    playbook: setup.playbook ?? '',
    checklist: arrayToText(setup.checklist),
    mistakes: arrayToText(setup.mistakes),
    isArchived: setup.isArchived,
    isMaster: setup.isMaster,
    sortOrder: setup.sortOrder,
    media: setup.media.map((item, index) => ({
      ...item,
      tempId: item.id ?? uniqueId(`media-${index}`),
      previewUrl: item.publicUrl,
      persisted: true,
    })),
    linkedTradeIds: setup.linkedTradeIds ?? [],
  }
}

function bytesToLabel(value?: number | null) {
  if (!value) return 'Datei'
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function getStudioSetups(setups: SavedSetup[], canManageMaster: boolean, view: StudioView) {
  return setups.filter((setup) => {
    if (setup.isMaster) return canManageMaster && view === 'master'
    if (view === 'archive') return setup.isArchived
    return view === 'active' && !setup.isArchived
  })
}

function getStudioViewForSetup(setup: SavedSetup): StudioView {
  if (setup.isMaster) return 'master'
  if (setup.isArchived) return 'archive'
  return 'active'
}

export function SetupStudio({ initialSetups, initialTrades, source, canManageMaster = false }: { initialSetups: SavedSetup[]; initialTrades: Trade[]; source: 'supabase' | 'mock'; canManageMaster?: boolean }) {
  const [studioView, setStudioView] = useState<StudioView>('active')
  const initialStudioSetups = getStudioSetups(initialSetups, canManageMaster, 'active')
  const [setups, setSetups] = useState(initialSetups)
  const [selectedId, setSelectedId] = useState<string | null>(initialStudioSetups[0]?.id ?? null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [draft, setDraft] = useState<DraftSetup>(buildDraft(initialStudioSetups[0]))
  const [status, setStatus] = useState(source === 'mock' ? 'Demo-Modus: Für echtes Speichern bitte Supabase verbinden.' : '')
  const [isExpanded, setIsExpanded] = useState(false)
  const [removedStoragePaths, setRemovedStoragePaths] = useState<string[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [tradeLinkQuery, setTradeLinkQuery] = useState('')
  const [activeExtraSection, setActiveExtraSection] = useState<'playbook' | 'checklist' | 'trades' | 'status' | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setSetups(initialSetups)
    if (isCreatingNew) return
    const studioSetups = getStudioSetups(initialSetups, canManageMaster, studioView)
    if (!studioSetups.length) {
      setSelectedId(null)
      setDraft(buildDraft(null))
      return
    }
    if (!selectedId || !studioSetups.some((setup) => setup.id === selectedId)) {
      setSelectedId(studioSetups[0].id)
      setDraft(buildDraft(studioSetups[0]))
    }
  }, [initialSetups, selectedId, canManageMaster, studioView, isCreatingNew])

  useEffect(() => {
    function handleMediaEdit(event: Event) {
      const detail = (event as CustomEvent<SetupMediaEditEventDetail>).detail ?? {}
      const targetSetup = detail.setupId ? setups.find((setup) => setup.id === detail.setupId) : null

      if (targetSetup && (!targetSetup.isMaster || canManageMaster)) {
        setIsExpanded(true)
        setIsCreatingNew(false)
        setStudioView(getStudioViewForSetup(targetSetup))
        setSelectedId(targetSetup.id)
        setRemovedStoragePaths([])
        setActiveExtraSection(null)
        setDraft(buildDraft(targetSetup))
        setStatus('Bilderbereich geöffnet. Cover, Beispiel oder Fehlerbild bearbeiten.')
      } else {
        setIsExpanded(true)
        setStudioView('active')
        setIsCreatingNew(true)
        setSelectedId(null)
        setRemovedStoragePaths([])
        setActiveExtraSection(null)
        const templateMedia = buildTemplateMedia(detail.media)
        setDraft({
          ...buildDraft(null),
          title: detail.title ? `${detail.title} · eigene Version` : '',
          category: detail.category?.trim() || 'Custom',
          description: detail.description ?? '',
          entry: detail.entry ?? '',
          exit: detail.exit ?? '',
          invalidation: detail.invalidation ?? '',
          playbook: detail.playbook ?? '',
          checklist: arrayToText(detail.checklist ?? []),
          mistakes: arrayToText(detail.mistakes ?? []),
          isMaster: false,
          media: templateMedia,
        })
        setStatus(templateMedia.length ? 'Eigene Setup-Version vorbereitet. Dummy-Bilder sind übernommen. Entfernen, ersetzen oder ergänzen und speichern.' : 'Eigene Setup-Version vorbereitet. Bild hinzufügen und speichern.')
      }

      window.setTimeout(() => {
        editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        fileInputRef.current?.focus()
      }, 0)
    }

    window.addEventListener('equora:setup-media-edit', handleMediaEdit)
    return () => window.removeEventListener('equora:setup-media-edit', handleMediaEdit)
  }, [setups, canManageMaster])

  const orderedSetups = useMemo(
    () => [...getStudioSetups(setups, canManageMaster, studioView)].sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'de')),
    [setups, canManageMaster, studioView],
  )
  const activeCount = setups.filter((setup) => !setup.isMaster && !setup.isArchived).length
  const archiveCount = setups.filter((setup) => !setup.isMaster && setup.isArchived).length
  const masterCount = setups.filter((setup) => setup.isMaster).length
  const selectedSetup = orderedSetups.find((setup) => setup.id === selectedId)
  const canEditDraft = !selectedSetup?.isMaster || canManageMaster
  const canPublishDraft = canManageMaster && canEditDraft && Boolean(draft.id)
  const activeViewLabel = studioView === 'master' ? 'Master-Bibliothek' : studioView === 'archive' ? 'Archiv' : 'Aktive Setups'
  const draftTitle = isCreatingNew ? (draft.isMaster ? 'Neues Master-Setup' : 'Neues Setup') : 'Grunddaten'
  const tradeLinkOptions = useMemo<TradeLinkOption[]>(() =>
    [...initialTrades]
      .sort((left, right) => `${right.date}-${right.market}`.localeCompare(`${left.date}-${left.market}`, 'de'))
      .map((trade) => ({
        id: trade.id,
        label: `${trade.market} · ${trade.setup || 'Ohne Setup'}`,
        meta: `${trade.date} · ${trade.session || '—'} · ${trade.result || '—'}`,
      })), [initialTrades])
  const filteredTradeLinkOptions = useMemo(() => {
    const query = tradeLinkQuery.trim().toLowerCase()
    const selected = new Set(draft.linkedTradeIds)
    return tradeLinkOptions
      .filter((option) => !selected.has(option.id))
      .filter((option) => (!query ? true : `${option.label} ${option.meta}`.toLowerCase().includes(query)))
      .slice(0, 8)
  }, [draft.linkedTradeIds, tradeLinkOptions, tradeLinkQuery])

  function applyDraft(update: Partial<DraftSetup>) {
    setDraft((current) => ({ ...current, ...update }))
  }

  function selectSetup(setupId: string | null) {
    setIsCreatingNew(false)
    if (setupId === null && studioView !== 'active') setStudioView('active')
    setSelectedId(setupId)
    setRemovedStoragePaths([])
    setDraft(buildDraft(orderedSetups.find((setup) => setup.id === setupId) ?? null))
  }

  function handleCreateSetup(options?: { master?: boolean }) {
    const createMaster = Boolean(options?.master && canManageMaster)
    setIsExpanded(true)
    setStudioView(createMaster ? 'master' : 'active')
    setIsCreatingNew(true)
    setSelectedId(null)
    setRemovedStoragePaths([])
    setActiveExtraSection(null)
    setDraft({ ...buildDraft(null), isMaster: createMaster })
    setStatus(createMaster ? 'Neues Master-Setup bereit.' : 'Neues Setup bereit.')
    window.setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      titleInputRef.current?.focus()
    }, 0)
  }

  function handleCancelCreate() {
    const nextSetup = orderedSetups[0] ?? null
    setIsCreatingNew(false)
    setSelectedId(nextSetup?.id ?? null)
    setDraft(buildDraft(nextSetup))
    setRemovedStoragePaths([])
    setActiveExtraSection(null)
    setStatus('Entwurf verworfen.')
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

  function toggleLinkedTrade(tradeId: string) {
    setDraft((current) => ({
      ...current,
      linkedTradeIds: current.linkedTradeIds.includes(tradeId)
        ? current.linkedTradeIds.filter((id) => id !== tradeId)
        : [...current.linkedTradeIds, tradeId],
    }))
  }

  function removeMedia(tempId: string) {
    setDraft((current) => {
      const target = current.media.find((item) => item.tempId === tempId)
      if (target?.persisted && target.storagePath && !target.storagePath.startsWith('template/')) {
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
        entry: draft.entry,
        exit: draft.exit,
        invalidation: draft.invalidation,
        playbook: draft.playbook,
        checklist: textToArray(draft.checklist),
        mistakes: textToArray(draft.mistakes),
        isArchived: draft.isArchived,
        isMaster: canManageMaster ? draft.isMaster : undefined,
        sortOrder: draft.sortOrder,
        media: persistedMedia,
        removedStoragePaths,
        linkedTradeIds: draft.linkedTradeIds,
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
            entry: draft.entry,
            exit: draft.exit,
            invalidation: draft.invalidation,
            playbook: draft.playbook,
            checklist: textToArray(draft.checklist),
            mistakes: textToArray(draft.mistakes),
            isArchived: draft.isArchived,
            isMaster: canManageMaster ? draft.isMaster : undefined,
            sortOrder: draft.sortOrder,
            media: combinedMedia,
            removedStoragePaths: [],
            linkedTradeIds: draft.linkedTradeIds,
          })

          if (!secondSave.success || !secondSave.setup) {
            setStatus(secondSave.message)
            return
          }

          setSetups((current) => {
            const rest = current.filter((item) => item.id !== secondSave.setup?.id)
            return [...rest, secondSave.setup]
          })
          setIsCreatingNew(false)
          setStudioView(getStudioViewForSetup(secondSave.setup))
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
        setIsCreatingNew(false)
        setStudioView(getStudioViewForSetup(firstSave.setup))
        setSelectedId(firstSave.setup.id)
        setDraft(buildDraft(firstSave.setup))
        setRemovedStoragePaths([])
      }
      setStatus(firstSave.message)
    })
  }


  function handleSetMaster(nextIsMaster: boolean) {
    if (!canManageMaster) {
      setStatus('Nur Admins können Master-Setups veröffentlichen.')
      return
    }

    if (!draft.id) {
      applyDraft({ isMaster: nextIsMaster, isArchived: false })
      setStudioView(nextIsMaster ? 'master' : 'active')
      setStatus(nextIsMaster ? 'Wird beim Speichern als Master veröffentlicht.' : 'Wird beim Speichern als eigenes Setup angelegt.')
      return
    }

    const pendingItems = draft.media.filter((item) => !item.persisted && item.file)
    if (pendingItems.length) {
      setStatus('Bitte Bilder zuerst speichern, dann Master-Status ändern.')
      return
    }

    startTransition(async () => {
      setStatus(nextIsMaster ? 'Setup wird als Master veröffentlicht …' : 'Master-Status wird zurückgenommen …')
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

      const result = await saveSetupEntry({
        id: draft.id,
        title: draft.title,
        category: draft.category,
        description: draft.description,
        entry: draft.entry,
        exit: draft.exit,
        invalidation: draft.invalidation,
        playbook: draft.playbook,
        checklist: textToArray(draft.checklist),
        mistakes: textToArray(draft.mistakes),
        isArchived: nextIsMaster ? false : draft.isArchived,
        isMaster: nextIsMaster,
        sortOrder: draft.sortOrder,
        media: persistedMedia,
        removedStoragePaths,
        linkedTradeIds: draft.linkedTradeIds,
      })

      setStatus(result.message)
      if (!result.success || !result.setup) return

      setSetups((current) => {
        const rest = current.filter((item) => item.id !== result.setup?.id)
        return [...rest, result.setup]
      })
      setIsCreatingNew(false)
      setStudioView(getStudioViewForSetup(result.setup))
      setSelectedId(result.setup.id)
      setDraft(buildDraft(result.setup))
      setRemovedStoragePaths([])
    })
  }

  function handleDelete() {
    if (!canEditDraft) {
      setStatus('Master-Setup ist nur für Admins editierbar.')
      return
    }

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
      const remainingInView = orderedSetups.filter((setup) => setup.id !== draft.id)
      setSetups((current) => current.filter((setup) => setup.id !== draft.id))
      setSelectedId(remainingInView[0]?.id ?? null)
      setDraft(buildDraft(remainingInView[0] ?? null))
      setRemovedStoragePaths([])
    })
  }

  return (
    <section id="setup-studio" className="scroll-mt-6 rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#998a72]">Setup Studio</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Regeln und Bilder bearbeiten</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
            Eigene Setups bearbeitest du direkt hier. Als Admin kannst du in der Master-Bibliothek auch Dummy-Bilder dauerhaft ersetzen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-medium text-white/70 transition hover:border-white/20 hover:text-white"
          >
            {isExpanded ? 'Studio ausblenden' : 'Studio öffnen'}
          </button>
          {!isExpanded ? (
            <button
              type="button"
              onClick={() => { setIsExpanded(true); handleCreateSetup() }}
              className="rounded-full border border-orange-300/25 bg-orange-400/10 px-4 py-2 text-xs font-medium text-orange-100 transition hover:border-orange-200/45"
            >
              Neues Setup
            </button>
          ) : null}
        </div>
      </div>

      {!isExpanded ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/58">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p>Der Setup-Bereich wurde gestrafft. Öffne das Studio nur dann, wenn du Regeln oder Bilder wirklich bearbeiten willst.</p>
              <p className="mt-2 text-xs text-white/42">{orderedSetups.length} Setups · {orderedSetups.reduce((sum, setup) => sum + setup.media.length, 0)} Bilder · Ansicht: {activeViewLabel}</p>
            </div>
            <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] px-4 py-3 text-xs text-emerald-100/80">
              Tipp: Öffne oben in der Bibliothek ein Master-Setup und klicke als Admin auf „Master-Bilder bearbeiten“.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <SetupStudioToolbar
              studioView={studioView}
              activeCount={activeCount}
              archiveCount={archiveCount}
              masterCount={masterCount}
              orderedCount={orderedSetups.length}
              imageCount={orderedSetups.reduce((sum, setup) => sum + setup.media.length, 0)}
              source={source}
              canManageMaster={canManageMaster}
              isCreatingNew={isCreatingNew}
              isPending={isPending}
              canEditDraft={canEditDraft}
              canPublishDraft={canPublishDraft}
              draftIsMaster={draft.isMaster}
              onChangeView={setStudioView}
              onCreateSetup={() => handleCreateSetup()}
              onCreateMasterSetup={() => handleCreateSetup({ master: true })}
              onCancelCreate={handleCancelCreate}
              onSave={handleSave}
              onSetMaster={handleSetMaster}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[0.32fr_0.68fr]">
            <SetupStudioSidebar
              activeViewLabel={activeViewLabel}
              orderedSetups={orderedSetups}
              selectedId={selectedId}
              isCreatingNew={isCreatingNew}
              draftTitle={draftTitle}
              studioViewIsMaster={studioView === 'master'}
              onFocusDraft={() => titleInputRef.current?.focus()}
              onSelectSetup={selectSetup}
              onCreateSetup={handleCreateSetup}
            />

            <SetupStudioEditor
              editorRef={editorRef}
              titleInputRef={titleInputRef}
              fileInputRef={fileInputRef}
              isCreatingNew={isCreatingNew}
              draftTitle={draftTitle}
              draft={draft}
              canManageMaster={canManageMaster}
              canEditDraft={canEditDraft}
              activeExtraSection={activeExtraSection}
              onSetActiveExtraSection={setActiveExtraSection}
              tradeLinkQuery={tradeLinkQuery}
              onSetTradeLinkQuery={setTradeLinkQuery}
              tradeLinkOptions={tradeLinkOptions}
              filteredTradeLinkOptions={filteredTradeLinkOptions}
              dragActive={dragActive}
              onSetDragActive={setDragActive}
              status={status}
              onApplyDraft={applyDraft}
              onFileChange={onFileChange}
              onDrop={onDrop}
              onUpdateMedia={updateMedia}
              onMoveMedia={moveMedia}
              onMarkAsCover={markAsCover}
              onToggleLinkedTrade={toggleLinkedTrade}
              onRemoveMedia={removeMedia}
              onDelete={handleDelete}
            />
          </div>
        </>
      )}
    </section>
  )
}
