'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { useEffect, useId, useMemo, useRef, useState, useTransition, type ChangeEvent, type DragEvent } from 'react'
import { deleteSetupEntry, saveSetupEntry } from '@/app/actions/setups'
import { requestUncommittedMediaCleanup } from '@/app/actions/media-cleanup'
import { uploadSetupImages } from '@/lib/supabase/storage'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import type { SavedSetup, SavedSetupMedia, SetupImageRole } from '@/lib/types/setup'
import type { Trade } from '@/lib/types/trade'
import { SetupStudioToolbar } from '@/components/setups/setup-studio-toolbar'
import { SetupStudioSidebar } from '@/components/setups/setup-studio-sidebar'
import { SetupStudioEditor } from '@/components/setups/setup-studio-editor'
import { type DraftSetup, type DraftSetupMedia, type StudioView, type TradeLinkOption } from '@/components/setups/setup-studio-types'

type SetupMediaEditEventDetail = {
  setupId?: string | null
  intent?: 'delete'
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
  const locale = useJournalLocale()
  const text = journalText(locale)
  const [studioView, setStudioView] = useState<StudioView>('active')
  const initialStudioSetups = getStudioSetups(initialSetups, canManageMaster, 'active')
  const [setups, setSetups] = useState(initialSetups)
  const [selectedId, setSelectedId] = useState<string | null>(initialStudioSetups[0]?.id ?? null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [draft, setDraft] = useState<DraftSetup>(buildDraft(initialStudioSetups[0]))
  const [status, setStatus] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [removedStoragePaths, setRemovedStoragePaths] = useState<string[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [tradeLinkQuery, setTradeLinkQuery] = useState('')
  const [activeExtraSection, setActiveExtraSection] = useState<'playbook' | 'checklist' | 'trades' | 'status' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Pick<SavedSetup, 'id' | 'title'> | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const deleteDialogRef = useRef<HTMLDialogElement | null>(null)
  const deleteInFlight = useRef(false)
  const deleteHeading = useId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const addImageRef = useRef<HTMLButtonElement | null>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setSetups(initialSetups)
  }, [initialSetups])

  useEffect(() => {
    if (isCreatingNew) return
    const studioSetups = getStudioSetups(setups, canManageMaster, studioView)
    if (!studioSetups.length) {
      setSelectedId(null)
      setDraft(buildDraft(null))
      return
    }
    if (!selectedId || !studioSetups.some((setup) => setup.id === selectedId)) {
      setSelectedId(studioSetups[0].id)
      setDraft(buildDraft(studioSetups[0]))
    }
  }, [setups, selectedId, canManageMaster, studioView, isCreatingNew])

  useEffect(() => {
    const dialog = deleteDialogRef.current
    if (deleteTarget && dialog && !dialog.open) dialog.showModal()
    if (!deleteTarget && dialog?.open) dialog.close()
  }, [deleteTarget])

  useEffect(() => {
    function handleMediaEdit(event: Event) {
      const detail = (event as CustomEvent<SetupMediaEditEventDetail>).detail ?? {}
      const targetSetup = detail.setupId ? setups.find((setup) => setup.id === detail.setupId) : null
      if (detail.intent === 'delete') {
        if (targetSetup && !targetSetup.isMaster && !isPending && !deleteInFlight.current) {
          setDeleteError('')
          setDeleteTarget(targetSetup)
        }
        return
      }
      if (detail.setupId && (!targetSetup || (targetSetup.isMaster && !canManageMaster))) return

      if (targetSetup && (!targetSetup.isMaster || canManageMaster)) {
        setIsExpanded(true)
        setIsCreatingNew(false)
        setStudioView(getStudioViewForSetup(targetSetup))
        setSelectedId(targetSetup.id)
        setRemovedStoragePaths([])
        setActiveExtraSection(null)
        setDraft(buildDraft(targetSetup))
        setStatus('')
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
          title: detail.title ? text(`${detail.title} · eigene Version`, `${detail.title} · my copy`) : '',
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
        setStatus(text('Eigene Kopie vorbereitet. Bilder wählen und speichern.', 'Your copy is ready. Choose images and save.'))
      }

      window.setTimeout(() => {
        addImageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        addImageRef.current?.focus({ preventScroll: true })
      }, 0)
    }

    window.addEventListener('equora:setup-media-edit', handleMediaEdit)
    return () => window.removeEventListener('equora:setup-media-edit', handleMediaEdit)
  }, [setups, canManageMaster, locale, isPending])

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
  const activeViewLabel = studioView === 'master' ? text('Master-Bibliothek', 'Shared library') : studioView === 'archive' ? text('Archiv', 'Archive') : text('Aktive Setups', 'Active setups')
  const draftTitle = isCreatingNew ? (draft.isMaster ? text('Neues Master-Setup', 'New shared setup') : text('Neues Setup', 'New setup')) : text('Grunddaten', 'Basic details')
  const tradeLinkOptions = useMemo<TradeLinkOption[]>(() =>
    [...initialTrades]
      .sort((left, right) => `${right.date}-${right.market}`.localeCompare(`${left.date}-${left.market}`, 'de'))
      .map((trade) => ({
        id: trade.id,
        label: `${trade.market} · ${trade.setup || text('Ohne Setup', 'No setup')}`,
        meta: `${trade.date} · ${trade.session || '—'} · ${trade.result || '—'}`,
      })), [initialTrades, locale])
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
    setStatus(createMaster ? text('Neues Master-Setup bereit.', 'New shared setup ready to edit.') : text('Neues Setup bereit.', 'New setup ready to edit.'))
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
    setStatus(text('Entwurf verworfen.', 'Draft discarded.'))
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
    setStatus(text(`${files.length} Bild${files.length === 1 ? '' : 'er'} bereit zum Speichern.`, `${files.length} ${files.length === 1 ? 'image' : 'images'} ready to save.`))
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
      setStatus(text('Setup wird gespeichert …', 'Saving setup…'))
      const pendingItems = draft.media.filter((item) => !item.persisted && item.file)
      const setupId = draft.id ?? crypto.randomUUID()
      let uploaded: Awaited<ReturnType<typeof uploadSetupImages>> = []

      try {
        if (pendingItems.length && hasSupabaseClientEnv()) {
          uploaded = await uploadSetupImages(setupId, pendingItems.map((item) => item.file as File))
        }

        let uploadIndex = 0
        const combinedMedia = draft.media
          .filter((item) => item.persisted || (hasSupabaseClientEnv() && item.file))
          .map<SavedSetupMedia>((item, index) => {
            const uploadedItem = !item.persisted && item.file ? uploaded[uploadIndex++] : null
            return {
              storagePath: uploadedItem?.storagePath ?? item.storagePath,
              publicUrl: uploadedItem?.publicUrl ?? item.publicUrl,
              fileName: uploadedItem?.fileName ?? item.fileName,
              mimeType: uploadedItem?.mimeType ?? item.mimeType,
              byteSize: uploadedItem?.byteSize ?? item.byteSize,
              sortOrder: index,
              isCover: item.isCover,
              caption: item.caption,
              mediaRole: item.mediaRole,
            }
          })

        const result = await saveSetupEntry({
          id: hasSupabaseClientEnv() ? setupId : draft.id,
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
          removedStoragePaths,
          linkedTradeIds: draft.linkedTradeIds,
        }, locale)

        if (!result.success) {
          if (uploaded.length) {
            await requestUncommittedMediaCleanup({ kind: 'setup', parentId: setupId, storagePaths: uploaded.map((item) => item.storagePath) })
          }
          setStatus(result.message)
          return
        }

        if (result.setup) {
          setSetups((current) => {
            const rest = current.filter((item) => item.id !== result.setup?.id)
            return [...rest, result.setup]
          })
          setIsCreatingNew(false)
          setStudioView(getStudioViewForSetup(result.setup))
          setSelectedId(result.setup.id)
          setDraft(buildDraft(result.setup))
          setRemovedStoragePaths([])
        }
        setStatus(result.message)
      } catch (error) {
        if (uploaded.length) {
          await requestUncommittedMediaCleanup({ kind: 'setup', parentId: setupId, storagePaths: uploaded.map((item) => item.storagePath) })
        }
        setStatus(locale === 'de' && error instanceof Error ? error.message : text('Setup konnte nicht gespeichert werden.', 'Could not save the setup. Check the setup before trying again.'))
      }
    })
  }


  function handleSetMaster(nextIsMaster: boolean) {
    if (!canManageMaster) {
      setStatus(text('Nur Admins können Master-Setups veröffentlichen.', 'Only admins can publish shared setups.'))
      return
    }

    if (!draft.id) {
      applyDraft({ isMaster: nextIsMaster, isArchived: false })
      setStudioView(nextIsMaster ? 'master' : 'active')
      setStatus(nextIsMaster ? text('Wird beim Speichern als Master veröffentlicht.', 'This setup will be shared when you save it.') : text('Wird beim Speichern als eigenes Setup angelegt.', 'This will be saved as a personal setup.'))
      return
    }

    const pendingItems = draft.media.filter((item) => !item.persisted && item.file)
    if (pendingItems.length) {
      setStatus(text('Bitte Bilder zuerst speichern, dann Master-Status ändern.', 'Save the images before changing the sharing status.'))
      return
    }

    startTransition(async () => {
      setStatus(nextIsMaster ? text('Setup wird als Master veröffentlicht …', 'Publishing the shared setup…') : text('Master-Status wird zurückgenommen …', 'Changing the setup to personal…'))
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
      }, locale)

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
      setStatus(text('Master-Setup ist nur für Admins editierbar.', 'Only admins can edit shared setups.'))
      return
    }

    if (!draft.id) {
      selectSetup(null)
      setStatus(text('Neues Setup verworfen.', 'New setup discarded.'))
      return
    }

    const target = setups.find((setup) => setup.id === draft.id)
    if (!target || isPending || deleteInFlight.current) return
    setDeleteError('')
    setDeleteTarget(target)
  }

  function confirmDelete() {
    if (!deleteTarget || isPending || deleteInFlight.current) return
    const target = deleteTarget
    deleteInFlight.current = true
    setDeleteError('')
    startTransition(async () => {
      try {
        const result = await deleteSetupEntry(target.id, locale)
        if (!result.success) {
          setDeleteError(result.message)
          return
        }
        setStatus(result.message)
        setSetups((current) => current.filter((setup) => setup.id !== target.id))
        if (selectedId === target.id) {
          const nextSetup = orderedSetups.find((setup) => setup.id !== target.id)
          setSelectedId(nextSetup?.id ?? null)
          setDraft(buildDraft(nextSetup))
          setRemovedStoragePaths([])
        }
        window.dispatchEvent(new CustomEvent('equora:setup-deleted', { detail: { setupId: target.id } }))
        setDeleteTarget(null)
      } catch {
        setDeleteError(text('Löschung konnte nicht bestätigt werden. Bitte lade die Setup-Liste neu.', 'Deletion could not be confirmed. Reload the setup list.'))
      } finally {
        deleteInFlight.current = false
      }
    })
  }

  return (
    <section id="setup-studio" className="scroll-mt-6 rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <dialog ref={deleteDialogRef} aria-labelledby={deleteHeading}
        onClose={() => setDeleteTarget(null)}
        onCancel={(event) => { if (deleteInFlight.current) event.preventDefault() }}
        className="m-auto w-[calc(100%_-_2rem)] max-w-[30rem] rounded-2xl border border-red-300/25 bg-[#181413] p-5 text-white backdrop:bg-black/75">
        {deleteTarget && (
          <>
            <h2 id={deleteHeading} className="break-words text-lg font-semibold">
              {text(`„${deleteTarget.title}“ löschen?`, `Delete “${deleteTarget.title}”?`)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              {text('Das Setup, seine Bilder und die Zuordnungen zu Trades werden dauerhaft entfernt.', 'The setup, its images and its links to trades will be removed permanently.')}
            </p>
            {deleteError && <p role="alert" className="mt-3 text-sm text-red-200">{deleteError}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={isPending} onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5">
                {text('Abbrechen', 'Cancel')}
              </button>
              <button type="button" disabled={isPending} onClick={confirmDelete}
                className="rounded-lg border border-red-300/30 bg-red-400/15 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-400/25 disabled:opacity-50">
                {isPending ? text('Wird gelöscht …', 'Deleting…') : text('Endgültig löschen', 'Delete permanently')}
              </button>
            </div>
          </>
        )}
      </dialog>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#998a72]">Setup Studio</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{text('Regeln und Bilder bearbeiten', 'Edit rules and images')}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
            {text('Bearbeite Regeln, Bilder und verknüpfte Trades.', 'Edit rules, images and linked trades.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-medium text-white/70 transition hover:border-white/20 hover:text-white"
          >
            {isExpanded ? text('Studio ausblenden', 'Hide studio') : text('Studio öffnen', 'Open studio')}
          </button>
          {!isExpanded ? (
            <button
              type="button"
              onClick={() => { setIsExpanded(true); handleCreateSetup() }}
              className="rounded-full border border-orange-300/25 bg-orange-400/10 px-4 py-2 text-xs font-medium text-orange-100 transition hover:border-orange-200/45"
            >
              {text('Neues Setup', 'New setup')}
            </button>
          ) : null}
        </div>
      </div>

      {!isExpanded ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/58">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              {status && <p role="status">{status}</p>}
              <p className="mt-2 text-xs text-white/42">{text(
                `${orderedSetups.length} Setups · ${orderedSetups.reduce((sum, setup) => sum + setup.media.length, 0)} Bilder · Ansicht: ${activeViewLabel}`,
                `${orderedSetups.length} setups · ${orderedSetups.reduce((sum, setup) => sum + setup.media.length, 0)} images · ${activeViewLabel}`,
              )}</p>
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
              addImageRef={addImageRef}
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
              status={status || (source === 'mock' ? text('Demo: Setups können hier nicht dauerhaft in einem Nutzerkonto gespeichert werden.', 'Demo: setups are not saved to an account.') : '')}
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
