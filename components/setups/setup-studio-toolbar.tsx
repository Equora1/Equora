import type { StudioView } from '@/components/setups/setup-studio-types'

type SetupStudioToolbarProps = {
  studioView: StudioView
  activeCount: number
  archiveCount: number
  masterCount: number
  orderedCount: number
  imageCount: number
  source: 'supabase' | 'mock'
  canManageMaster: boolean
  isCreatingNew: boolean
  isPending: boolean
  canEditDraft: boolean
  canPublishDraft: boolean
  draftIsMaster: boolean
  onChangeView: (view: StudioView) => void
  onCreateSetup: () => void
  onCreateMasterSetup: () => void
  onCancelCreate: () => void
  onSave: () => void
  onSetMaster: (nextIsMaster: boolean) => void
}

export function SetupStudioToolbar({
  studioView,
  activeCount,
  archiveCount,
  masterCount,
  orderedCount,
  imageCount,
  source,
  canManageMaster,
  isCreatingNew,
  isPending,
  canEditDraft,
  canPublishDraft,
  draftIsMaster,
  onChangeView,
  onCreateSetup,
  onCreateMasterSetup,
  onCancelCreate,
  onSave,
  onSetMaster,
}: SetupStudioToolbarProps) {
  return (
    <>
      <div className="mb-6 rounded-3xl border border-orange-400/15 bg-orange-400/[0.05] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-orange-100/60">Setups</p>
            <h2 className="mt-2 text-2xl font-semibold text-orange-200">Setup Studio</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <StudioMetric label="Setups" value={String(orderedCount)} />
            <StudioMetric label="Bilder" value={String(imageCount)} />
            {canManageMaster ? <StudioMetric label="Admin · Master" value={String(masterCount)} /> : null}
            <StudioMetric label="Modus" value={source === 'supabase' ? 'Live' : 'Demo'} />
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <StudioTab label={`Aktiv ${activeCount}`} active={studioView === 'active'} onClick={() => onChangeView('active')} />
            {canManageMaster ? <StudioTab label={`Admin · Master ${masterCount}`} active={studioView === 'master'} onClick={() => onChangeView('master')} /> : null}
            <StudioTab label={`Archiv ${archiveCount}`} active={studioView === 'archive'} onClick={() => onChangeView('archive')} />
          </div>
          {studioView === 'archive' ? <p className="text-xs text-white/40">Archiv ist Ablage.</p> : null}
          {studioView === 'master' ? <p className="text-xs text-orange-100/55">Admin-Bibliothek. Sichtbar für alle.</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCreateSetup}
            className="rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-400/45 hover:bg-orange-400/15"
          >
            + Neues Setup
          </button>
          {canManageMaster ? (
            <button
              type="button"
              onClick={onCreateMasterSetup}
              className="rounded-full border border-orange-400/20 bg-black/25 px-4 py-2 text-sm text-orange-100/85 transition hover:border-orange-400/35 hover:bg-orange-400/10"
            >
              Admin · Master-Setup
            </button>
          ) : null}
          {canPublishDraft ? (
            <button
              type="button"
              onClick={() => onSetMaster(!draftIsMaster)}
              disabled={isPending}
              className="rounded-full border border-orange-400/25 bg-orange-400/12 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-400/45 hover:bg-orange-400/18 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {draftIsMaster ? 'Master zurücknehmen' : 'Als Master veröffentlichen'}
            </button>
          ) : null}
          {isCreatingNew ? (
            <button
              type="button"
              onClick={onCancelCreate}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-white"
            >
              Abbrechen
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={isPending || !canEditDraft}
            className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200 transition hover:border-emerald-400/35 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? 'Speichert …' : isCreatingNew ? 'Setup anlegen' : 'Setup speichern'}
          </button>
        </div>
      </div>
    </>
  )
}

function StudioTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${active ? 'border-orange-400/30 bg-orange-400/10 text-orange-100' : 'border-white/10 bg-black/20 text-white/65 hover:border-white/20 hover:text-white'}`}
    >
      {label}
    </button>
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
