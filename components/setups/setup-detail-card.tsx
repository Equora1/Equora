import type { ReactNode } from 'react'
import { SetupImageLightbox } from '@/components/setups/setup-image-lightbox'
import type { SetupDetail } from '@/lib/types/setup'
import type { Trade } from '@/lib/types/trade'

function getMediaRoleLabel(role?: string | null) {
  switch (role) {
    case 'best-practice':
      return 'Best Practice'
    case 'mistake':
      return 'Fehlerbeispiel'
    default:
      return 'Beispiel'
  }
}

export function SetupDetailCard({ title, data, linkedTrades }: { title: string; data?: SetupDetail; linkedTrades: Trade[] }) {
  const imageItems = data?.exampleImageItems?.length
    ? data.exampleImageItems
    : (data?.exampleImages ?? []).map((url, index) => ({
        url,
        caption: undefined,
        isCover: index === 0,
        mediaRole: 'example' as const,
      }))

  return (
    <section className="rounded-3xl border border-[#221e1a] bg-[#0d0d0d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.25em] text-[#998a72]">Setup Detail</p>
          <h2 className="eq-display eq-text-gradient mt-3 text-[1.9rem] leading-none">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-[#998a72]">
            Playbook, Medien-Galerie, Checkliste und Journal-Beispiele in breiten Blöcken statt in schmalen Kassenbon-Zeilen.
          </p>
        </div>
        <div className="rounded-full border border-[#c8823a]/20 bg-[#c8823a]/10 px-3 py-1 text-xs text-[#f0a855]">
          {data?.category ?? 'Setup'}
        </div>
      </div>

      <div className="space-y-4">
        <WideSection title="Hauptbeispiel" eyebrow="Cover">
          <div className="overflow-hidden rounded-2xl border border-[#c8823a]/20 bg-gradient-to-br from-[#c8823a]/10 to-transparent p-3">
            {data?.coverImage ? (
              <SetupImageLightbox
                src={data.coverImage}
                alt={`${title} Hauptbeispiel`}
                badge="Cover"
                caption={data.playbook ?? null}
                hint="Klick oder Doppelklick für Großansicht"
                imageClassName="rounded-lg"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-black/30 text-[#998a72]">
                Kein Beispielbild hinterlegt
              </div>
            )}
          </div>
        </WideSection>

        <WideSection title="Rahmen im Überblick" eyebrow="Setup-Rahmen">
          <div className="space-y-3">
            <InfoBlock title="Entry" tone="neutral">
              {data?.entry || 'Noch kein Entry-Rahmen hinterlegt.'}
            </InfoBlock>
            <InfoBlock title="Exit" tone="neutral">
              {data?.exit || 'Noch kein Exit-Rahmen hinterlegt.'}
            </InfoBlock>
            <InfoBlock title="Invalidierung" tone="danger">
              {data?.invalidation || 'Noch keine Invalidierung hinterlegt.'}
            </InfoBlock>
            <InfoBlock
              title="Performance"
              tone="accent"
              note={`Beste Kombination: ${data?.bestMarket ?? '–'} · ${data?.bestSession ?? '–'}`}
            >
              {data?.performance || 'Noch keine Performance-Hinweise hinterlegt.'}
            </InfoBlock>
          </div>
        </WideSection>

        {data?.playbook ? (
          <WideSection title="Playbook" eyebrow="Ausführung">
            <p className="text-sm leading-7 text-white/75">{data.playbook}</p>
          </WideSection>
        ) : null}

        {data?.checklist?.length ? (
          <WideSection title="Checklist" eyebrow="Vor dem Entry">
            <div className="space-y-2">
              {data.checklist.map((item) => (
                <div key={item} className="rounded-2xl border border-[#c8823a]/18 bg-[#c8823a]/8 px-4 py-3 text-sm leading-6 text-[#f0a855]">
                  {item}
                </div>
              ))}
            </div>
          </WideSection>
        ) : null}

        <WideSection title="Typische Fehler" eyebrow="Warnsignale">
          <div className="space-y-2">
            {data?.mistakes?.length ? (
              data.mistakes.map((item) => (
                <div key={item} className="rounded-2xl border border-[#e5484d]/18 bg-[#e5484d]/5 px-4 py-3 text-sm leading-6 text-red-200/80">
                  {item}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#998a72]">
                Noch keine typischen Fehler hinterlegt.
              </div>
            )}
          </div>
        </WideSection>

        {imageItems.length ? (
          <WideSection title="Beispiel-Galerie" eyebrow="Charts">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {imageItems.map((item, idx) => (
                <div key={`${item.url}-${idx}`} className="overflow-hidden rounded-2xl border border-[#221e1a] bg-[#1f1c1a]/55">
                  <SetupImageLightbox
                    src={item.url}
                    alt={`${title} Beispiel ${idx + 1}`}
                    badge={getMediaRoleLabel(item.mediaRole)}
                    caption={item.caption ?? null}
                    hint="Klick oder Doppelklick für Großansicht"
                  />
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#b09a7a]">
                        {getMediaRoleLabel(item.mediaRole)}
                      </span>
                      {item.isCover ? (
                        <span className="rounded-full border border-[#c8823a]/20 bg-[#c8823a]/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#f0a855]">
                          Cover
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm leading-6 text-[#998a72]">{item.caption || 'Noch kein Kommentar für dieses Bild hinterlegt.'}</p>
                  </div>
                </div>
              ))}
            </div>
          </WideSection>
        ) : null}

        <WideSection title="Passende Trades" eyebrow="Journal-Beispiele">
          <div className="space-y-2">
            {linkedTrades.length ? (
              linkedTrades.map((trade) => (
                <div key={trade.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-white">
                        {trade.market} · {trade.session}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#998a72]">
                        {trade.date} · {trade.emotion} · {trade.quality}
                      </p>
                    </div>
                    <span
                      className={
                        trade.netPnL === undefined || trade.netPnL === null
                          ? 'text-[#998a72]'
                          : trade.netPnL >= 0
                            ? 'text-[#f0a855]'
                            : 'text-red-300'
                      }
                    >
                      {trade.result}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#998a72]">
                Noch keine verknüpften Trades in deinem Journal.
              </div>
            )}
          </div>
        </WideSection>
      </div>
    </section>
  )
}

function WideSection({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#221e1a] bg-[#1f1c1a]/55 p-4 xl:p-5">
      <p className="text-[10px] uppercase tracking-[0.24em] text-[#998a72]">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function InfoBlock({
  title,
  children,
  tone,
  note,
}: {
  title: string
  children: ReactNode
  tone: 'neutral' | 'accent' | 'danger'
  note?: string
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-[#c8823a]/20 bg-[#c8823a]/8'
      : tone === 'danger'
        ? 'border-[#e5484d]/18 bg-[#e5484d]/5'
        : 'border-white/10 bg-white/5'

  const textClass = tone === 'danger' ? 'text-red-200/80' : tone === 'accent' ? 'text-[#f0a855]' : 'text-white/75'

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-[0.22em] text-[#998a72]">{title}</p>
      <p className={`mt-3 text-sm leading-6 ${textClass}`}>{children}</p>
      {note ? <p className="mt-2 text-xs leading-5 text-[#998a72]">{note}</p> : null}
    </div>
  )
}
