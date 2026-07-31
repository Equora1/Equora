import type { SavedSetup } from '@/lib/types/setup'

type SetupStudioSidebarProps = {
  activeViewLabel: string
  orderedSetups: SavedSetup[]
  selectedId: string | null
  isCreatingNew: boolean
  draftTitle: string
  studioViewIsMaster: boolean
  onFocusDraft: () => void
  onSelectSetup: (setupId: string) => void
  onCreateSetup: (options?: { master?: boolean }) => void
}

export function SetupStudioSidebar({
  activeViewLabel,
  orderedSetups,
  selectedId,
  isCreatingNew,
  draftTitle,
  studioViewIsMaster,
  onFocusDraft,
  onSelectSetup,
  onCreateSetup,
}: SetupStudioSidebarProps) {
  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{activeViewLabel}</p>
        <p className="mt-2 text-sm text-white">{isCreatingNew ? draftTitle : `${orderedSetups.length} Setups`}</p>
      </div>

      <div className="space-y-2">
        {isCreatingNew ? (
          <button
            type="button"
            onClick={onFocusDraft}
            className="w-full rounded-2xl border border-orange-400/30 bg-orange-400/10 px-4 py-3 text-left shadow-[0_0_18px_rgba(251,146,60,0.10)]"
          >
            <p className="font-medium text-orange-100">{draftTitle}</p>
            <p className="mt-1 text-xs text-orange-100/55">Noch nicht gespeichert</p>
          </button>
        ) : null}
        {orderedSetups.length ? (
          orderedSetups.map((setup) => (
            <button
              key={setup.id}
              type="button"
              onClick={() => onSelectSetup(setup.id)}
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
                <div className="flex flex-col items-end gap-1">
                  {setup.isMaster ? <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-orange-100/85">Master</span> : null}
                  {setup.isArchived ? <span className="rounded-full border border-red-400/15 bg-red-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-red-200/80">Archiv</span> : null}
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/58">{setup.description || 'Noch keine Beschreibung hinterlegt.'}</p>
            </button>
          ))
        ) : !isCreatingNew ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-white/55">
            <p>Keine Setups in dieser Ansicht.</p>
            <button type="button" onClick={() => onCreateSetup({ master: studioViewIsMaster })} className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/85">
              {studioViewIsMaster ? '+ Master-Setup' : '+ Neues Setup'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
