import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
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
  const locale = useJournalLocale()
  const text = journalText(locale)
  return (
    <>
      <div className="mb-6 rounded-3xl border border-orange-400/15 bg-orange-400/[0.05] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-orange-100/60">Setups</p>
            <h2 className="mt-2 text-2xl font-semibold text-orange-200">{text('Deine Setups', 'Your setups')}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">{text('Halte Regeln und Bildbeispiele fest. Verknüpfe passende Trades, um deine Erfahrungen mit dem Setup nachzubereiten.', 'Record rules and example images. Link relevant trades to review how the setup worked.')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <StudioMetric label="Setups" value={String(orderedCount)} />
            <StudioMetric label={text('Bilder', 'Images')} value={String(imageCount)} />
            {canManageMaster ? <StudioMetric label={text('Admin · Master', 'Admin · Shared')} value={String(masterCount)} /> : null}
            <StudioMetric label={text('Modus', 'Mode')} value={source === 'supabase' ? 'Live' : 'Demo'} />
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <StudioTab label={text(`Aktiv ${activeCount}`, `Active ${activeCount}`)} active={studioView === 'active'} onClick={() => onChangeView('active')} />
            {canManageMaster ? <StudioTab label={text(`Admin · Master ${masterCount}`, `Admin · Shared ${masterCount}`)} active={studioView === 'master'} onClick={() => onChangeView('master')} /> : null}
            <StudioTab label={text(`Archiv ${archiveCount}`, `Archive ${archiveCount}`)} active={studioView === 'archive'} onClick={() => onChangeView('archive')} />
          </div>
          {studioView === 'archive' ? <p className="text-xs text-white/40">{text('Archivierte Setups bleiben erhalten.', 'Archived setups are kept here.')}</p> : null}
          {studioView === 'master' ? <p className="text-xs text-orange-100/55">{text('Gemeinsame Vorlagen. Änderungen sind für alle Nutzer sichtbar.', 'Changes to shared setups are visible to all users.')}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCreateSetup}
            className="rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-400/45 hover:bg-orange-400/15"
          >
            {text('+ Neues Setup', '+ New setup')}
          </button>
          {canManageMaster ? (
            <button
              type="button"
              onClick={onCreateMasterSetup}
              className="rounded-full border border-orange-400/20 bg-black/25 px-4 py-2 text-sm text-orange-100/85 transition hover:border-orange-400/35 hover:bg-orange-400/10"
            >
              {text('Admin · Master-Setup', 'New shared setup')}
            </button>
          ) : null}
          {canPublishDraft ? (
            <button
              type="button"
              onClick={() => onSetMaster(!draftIsMaster)}
              disabled={isPending}
              className="rounded-full border border-orange-400/25 bg-orange-400/12 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-400/45 hover:bg-orange-400/18 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {draftIsMaster ? text('Master zurücknehmen', 'Make personal') : text('Als Master veröffentlichen', 'Publish as shared')}
            </button>
          ) : null}
          {isCreatingNew ? (
            <button
              type="button"
              onClick={onCancelCreate}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/65 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-white"
            >
              {text('Abbrechen', 'Cancel')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={isPending || !canEditDraft}
            className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200 transition hover:border-emerald-400/35 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? text('Speichert …', 'Saving…') : isCreatingNew ? text('Setup anlegen', 'Create setup') : text('Setup speichern', 'Save setup')}
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
