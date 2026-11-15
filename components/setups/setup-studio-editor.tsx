import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { ChangeEvent, Dispatch, DragEvent, RefObject, SetStateAction } from 'react'
import type { SetupImageRole } from '@/lib/types/setup'
import { defaultCategories, mediaRoleOptions, getSetupImageRoleLabel, type DraftSetup, type DraftSetupMedia, type TradeLinkOption } from '@/components/setups/setup-studio-types'

type ExtraSection = 'playbook' | 'checklist' | 'trades' | 'status' | null

type SetupStudioEditorProps = {
  editorRef: RefObject<HTMLDivElement | null>
  titleInputRef: RefObject<HTMLInputElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  isCreatingNew: boolean
  draftTitle: string
  draft: DraftSetup
  canManageMaster: boolean
  canEditDraft: boolean
  activeExtraSection: ExtraSection
  onSetActiveExtraSection: Dispatch<SetStateAction<ExtraSection>>
  tradeLinkQuery: string
  onSetTradeLinkQuery: (value: string) => void
  tradeLinkOptions: TradeLinkOption[]
  filteredTradeLinkOptions: TradeLinkOption[]
  dragActive: boolean
  onSetDragActive: (active: boolean) => void
  status: string
  onApplyDraft: (update: Partial<DraftSetup>) => void
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onUpdateMedia: (tempId: string, updater: (item: DraftSetupMedia) => DraftSetupMedia) => void
  onMoveMedia: (tempId: string, direction: -1 | 1) => void
  onMarkAsCover: (tempId: string) => void
  onToggleLinkedTrade: (tradeId: string) => void
  onRemoveMedia: (tempId: string) => void
  onDelete: () => void
}

function bytesToLabel(value: number | null | undefined, locale: JournalLocale) {
  const text = journalText(locale)
  if (!value) return text('Datei', 'File')
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function SetupStudioEditor({
  editorRef,
  titleInputRef,
  fileInputRef,
  isCreatingNew,
  draftTitle,
  draft,
  canManageMaster,
  canEditDraft,
  activeExtraSection,
  onSetActiveExtraSection,
  tradeLinkQuery,
  onSetTradeLinkQuery,
  tradeLinkOptions,
  filteredTradeLinkOptions,
  dragActive,
  onSetDragActive,
  status,
  onApplyDraft,
  onFileChange,
  onDrop,
  onUpdateMedia,
  onMoveMedia,
  onMarkAsCover,
  onToggleLinkedTrade,
  onRemoveMedia,
  onDelete,
}: SetupStudioEditorProps) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  return (
        <div ref={editorRef} className={`space-y-5 rounded-3xl border p-5 ${isCreatingNew ? 'border-orange-400/25 bg-orange-400/[0.04]' : 'border-white/10 bg-black/20'}`}>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{draftTitle}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-orange-100/65">{text('Setup Name', 'Setup name')}</span>
              <input ref={titleInputRef} value={draft.title} onChange={(event) => onApplyDraft({ title: event.target.value })} placeholder={text('z. B. NY Sweep + Reclaim', 'e.g. NY Sweep + Reclaim')} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400/30" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-orange-100/65">{text('Kategorie', 'Category')}</span>
              <input list="setup-categories" value={draft.category} onChange={(event) => onApplyDraft({ category: event.target.value })} placeholder="SMC, Breakout, Momentum …" className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400/30" />
              <datalist id="setup-categories">{defaultCategories.map((option) => <option key={option} value={option} />)}</datalist>
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-orange-100/65">{text('Kurzbeschreibung', 'Short description')}</span>
            <textarea value={draft.description} onChange={(event) => onApplyDraft({ description: event.target.value })} rows={3} placeholder={text('Kurzbeschreibung', 'Short description')} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
          </label>

          <div className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-orange-100/60">{text('Setup-Regeln', 'Setup rules')}</p>
              
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-orange-100/65">Entry</span>
                <textarea value={draft.entry} onChange={(event) => onApplyDraft({ entry: event.target.value })} rows={4} placeholder={text('Wann ist der Einstieg valide?', 'What makes an entry valid?')} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-orange-100/65">Exit</span>
                <textarea value={draft.exit} onChange={(event) => onApplyDraft({ exit: event.target.value })} rows={4} placeholder={text('Wo wird Gewinn gesichert oder der Trade beendet?', 'When do you take profit or close the trade?')} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-orange-100/65">{text('Invalidierung', 'Invalidation')}</span>
                <textarea value={draft.invalidation} onChange={(event) => onApplyDraft({ invalidation: event.target.value })} rows={4} placeholder={text('Woran ist klar, dass das Setup nicht mehr gilt?', 'What invalidates this setup?')} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-orange-100/55">{text('Mehr', 'More')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { key: 'playbook' as const, label: 'Playbook' },
                { key: 'checklist' as const, label: text('Checkliste', 'Checklist') },
                { key: 'trades' as const, label: 'Trades' },
                { key: 'status' as const, label: canManageMaster ? text('Status & Master', 'Status and sharing') : text('Archiv & Löschen', 'Archive and delete') },
              ].map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => onSetActiveExtraSection((current) => (current === section.key ? null : section.key))}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${activeExtraSection === section.key ? 'border-orange-400/30 bg-orange-400/10 text-orange-100' : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:text-white'}`}
                >
                  {section.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {activeExtraSection === 'playbook' ? (
                <div className="space-y-4">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-orange-100/65">{text('Playbook / Ablauf', 'Playbook / process')}</span>
                    <textarea value={draft.playbook} onChange={(event) => onApplyDraft({ playbook: event.target.value })} rows={4} placeholder={text('Wann ist das Setup gültig, was ist der Trigger, wo liegt die Invalidierung?', 'What makes the setup valid, triggers an entry or invalidates it?')} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
                  </label>
                </div>
              ) : null}

              {activeExtraSection === 'checklist' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-orange-100/65">{text('Checkliste', 'Checklist')}</span>
                    <textarea value={draft.checklist} onChange={(event) => onApplyDraft({ checklist: event.target.value })} rows={5} placeholder={text('Übergeordnete Richtung passt\nTrigger bestätigt\nChance und Risiko geprüft', 'Higher-timeframe direction matches\nEntry trigger confirmed\nReward and risk checked')} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-orange-100/65">{text('Typische Fehler', 'Common mistakes')}</span>
                    <textarea value={draft.mistakes} onChange={(event) => onApplyDraft({ mistakes: event.target.value })} rows={5} placeholder={text('Zu früh eingestiegen\nKontext fehlt\nDem Kurs hinterhergelaufen', 'Entered too early\nMissing context\nChased the price')} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
                  </label>
                </div>
              ) : null}

              {activeExtraSection === 'trades' ? (
                <div className="space-y-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-orange-100/65">{text('Trades verknüpfen', 'Link trades')}</p>
                      
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/55">{text(`${draft.linkedTradeIds.length} verknüpft`, `${draft.linkedTradeIds.length} linked`)}</div>
                  </div>

                  <label className="space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-orange-100/60">{text('Trade suchen', 'Find a trade')}</span>
                    <input value={tradeLinkQuery} onChange={(event) => onSetTradeLinkQuery(event.target.value)} placeholder={text('Markt, Setup oder Datum suchen', 'Search market, setup or date')} className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400/30" />
                  </label>

                  {draft.linkedTradeIds.length ? (
                    <div className="flex flex-wrap gap-2">
                      {draft.linkedTradeIds.map((tradeId) => {
                        const option = tradeLinkOptions.find((entry) => entry.id === tradeId)
                        if (!option) return null
                        return (
                          <button key={tradeId} type="button" onClick={() => onToggleLinkedTrade(tradeId)} className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100 transition hover:border-emerald-400/35">
                            <span>{option.label}</span>
                            <span className="rounded-full border border-current/20 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em]">{text('Lösen', 'Unlink')}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">{text('Noch keine Trades manuell verknüpft.', 'No trades linked manually yet.')}</div>
                  )}

                  <div className="space-y-2">
                    {filteredTradeLinkOptions.length ? (
                      filteredTradeLinkOptions.map((option) => (
                        <button key={option.id} type="button" onClick={() => onToggleLinkedTrade(option.id)} className="flex w-full items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.05]">
                          <div>
                            <p className="text-sm text-white">{option.label}</p>
                            <p className="mt-1 text-xs leading-5 text-white/45">{option.meta}</p>
                          </div>
                          <span className="rounded-full border border-orange-400/18 bg-orange-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f0a855]">{text('Verknüpfen', 'Link')}</span>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">{text('Keine weiteren Trades für diese Suche gefunden.', 'No more trades match this search.')}</div>
                    )}
                  </div>
                </div>
              ) : null}

              {activeExtraSection === 'status' ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-4">
                    {canManageMaster ? (
                      <label className="flex items-center gap-3 text-sm text-orange-100/85">
                        <input type="checkbox" checked={draft.isMaster} onChange={(event) => onApplyDraft({ isMaster: event.target.checked })} className="h-4 w-4 rounded border-white/20 bg-black/40 text-orange-400 focus:ring-orange-400/30" />
                        {text('Master-Setup', 'Shared setup')}
                      </label>
                    ) : null}
                    <label className="flex items-center gap-3 text-sm text-white/70">
                      <input type="checkbox" checked={draft.isArchived} onChange={(event) => onApplyDraft({ isArchived: event.target.checked })} className="h-4 w-4 rounded border-white/20 bg-black/40 text-orange-400 focus:ring-orange-400/30" />
                      {text('Archivieren', 'Archive')}
                    </label>
                  </div>
                  <button type="button" onClick={onDelete} disabled={!canEditDraft} className="rounded-full border border-red-400/15 bg-red-400/10 px-4 py-2 text-sm text-red-200/85 transition hover:border-red-400/30 hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-50">{draft.id ? text('Setup löschen', 'Delete setup') : text('Entwurf verwerfen', 'Discard draft')}</button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 rounded-3xl border border-emerald-400/15 bg-emerald-400/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-emerald-100">{text('Setup-Bilder', 'Setup images')}</p>
                <p className="mt-1 text-xs leading-5 text-white/45">{text('Cover, Beispiel und Fehlerbild werden über vorhandenes Setup Media gespeichert.', 'Use images to show the setup and what to watch for.')}</p>
                
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-full border border-emerald-400/20 bg-black/25 px-4 py-2 text-sm text-emerald-100 transition hover:border-emerald-400/35 hover:bg-black/35">{text('Bild hinzufügen', 'Add image')}</button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={onFileChange} />
            <div
              onDragEnter={(event) => { event.preventDefault(); onSetDragActive(true) }}
              onDragOver={(event) => { event.preventDefault(); onSetDragActive(true) }}
              onDragLeave={(event) => { event.preventDefault(); onSetDragActive(false) }}
              onDrop={onDrop}
              className={`rounded-3xl border border-dashed px-5 py-8 text-center transition ${dragActive ? 'border-emerald-400/45 bg-emerald-400/10' : 'border-white/12 bg-black/20'}`}
            >
              <p className="text-sm text-white/75">{text('Bilder hier hineinziehen oder oben wählen', 'Drop images here or use Add image')}</p>
              <p className="mt-2 text-xs text-white/40">{text('Rolle nach dem Upload setzen: Cover, Beispiel oder Fehlerbild.', 'Choose an image role and mark one image as the cover.')}</p>
            </div>

            {draft.media.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {draft.media.map((item, index) => (
                  <div key={item.tempId} className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
                    <div className="relative">
                      <img src={item.previewUrl} alt={item.fileName ?? text(`Setup Media ${index + 1}`, `Setup image ${index + 1}`)} className="h-40 w-full object-cover" />
                      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                        {item.isCover ? <span className="rounded-full border border-orange-400/20 bg-orange-400/90 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-black">Cover</span> : null}
                        {!item.persisted ? <span className="rounded-full border border-white/15 bg-black/50 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80">{text('Neu', 'New')}</span> : null}
                        <span className="rounded-full border border-white/15 bg-black/50 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80">{getSetupImageRoleLabel(item.mediaRole, locale)}</span>
                      </div>
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-3 text-xs text-white/45">
                        <span className="truncate">{item.fileName ?? text('Bild', 'Image')}</span>
                        <span>{bytesToLabel(item.byteSize, locale)}</span>
                      </div>
                      <label className="space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Bildrolle', 'Image role')}</span>
                        <select value={item.mediaRole ?? 'example'} onChange={(event) => onUpdateMedia(item.tempId, (current) => ({ ...current, mediaRole: event.target.value as SetupImageRole }))} className="w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none transition focus:border-orange-400/30">
                          {mediaRoleOptions.map((option) => <option key={option.value} value={option.value}>{getSetupImageRoleLabel(option.value, locale)}</option>)}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Kommentar', 'Caption')}</span>
                        <textarea value={item.caption ?? ''} onChange={(event) => onUpdateMedia(item.tempId, (current) => ({ ...current, caption: event.target.value }))} rows={3} placeholder={text('Worauf soll der Nutzer hier achten?', 'What should the reader look for?')} className="w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm leading-6 text-white outline-none transition focus:border-orange-400/30" />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => onMarkAsCover(item.tempId)} disabled={item.isCover} className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/85 transition hover:border-orange-400/35 disabled:cursor-not-allowed disabled:opacity-45">{item.isCover ? 'Cover' : text('Zum Cover machen', 'Make cover')}</button>
                        <button type="button" onClick={() => onMoveMedia(item.tempId, -1)} disabled={index === 0} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75 transition hover:border-white/18 disabled:opacity-40">{text('Hoch', 'Move up')}</button>
                        <button type="button" onClick={() => onMoveMedia(item.tempId, 1)} disabled={index === draft.media.length - 1} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75 transition hover:border-white/18 disabled:opacity-40">{text('Runter', 'Move down')}</button>
                        <button type="button" onClick={() => onRemoveMedia(item.tempId)} className="rounded-full border border-red-400/15 bg-red-400/10 px-3 py-1.5 text-xs text-red-200/85 transition hover:border-red-400/30">{text('Entfernen', 'Remove')}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/55">
                {text('Noch keine Bilder hinterlegt. Bild hinzufügen, Rolle wählen und bei Bedarf als Cover markieren.', 'No images yet. Add an image, choose a role and mark a cover if needed.')}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/65">{status || text('Bereit.', 'Ready.')}</div>
        </div>
  )
}
