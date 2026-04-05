'use client'

import { useMemo, useState } from 'react'
import { SectionHeader } from '@/components/layout/section-header'
import { SetupCard } from '@/components/setups/setup-card'
import { SetupDetailCard } from '@/components/setups/setup-detail-card'
import type { SetupDetail, SetupLibraryItem } from '@/lib/types/setup'
import type { Trade } from '@/lib/types/trade'

export function SetupExplorer({
  setupLibrary,
  setupDetails,
  trades,
}: {
  setupLibrary: SetupLibraryItem[]
  setupDetails: Record<string, SetupDetail | undefined>
  trades: Trade[]
}) {
  const [selectedSetup, setSelectedSetup] = useState(setupLibrary[0]?.title || 'Liquidity Sweep')
  const linkedTrades = useMemo(() => trades.filter((trade) => trade.setup === selectedSetup), [selectedSetup, trades])
  const selectedLibraryItem = setupLibrary.find((setup) => setup.title === selectedSetup)
  const selectedDetail = setupDetails[selectedSetup]
  const exampleCount = selectedDetail?.exampleImageItems?.length ?? selectedDetail?.exampleImages?.length ?? 0

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#221e1a] bg-[#0d0d0d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-6">
        <SectionHeader
          eyebrow="Setups"
          title="Setup Explorer"
          copy="Ein breiter Setup-Rahmen statt schmaler Kassenzettel: oben dein aktives Playbook, darunter die ruhige Bibliothek."
          badge={`Aktiv: ${selectedSetup}`}
        />

        <div className="mt-5 rounded-3xl border border-orange-400/15 bg-orange-400/[0.05] p-5 xl:p-6">
          <div className="flex flex-col gap-5">
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-orange-100/55">Aktiver Setup-Rahmen</p>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <h3 className="text-2xl font-semibold text-white xl:text-[2rem]">{selectedSetup}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/60">
                    {selectedLibraryItem?.description ||
                      'Dieses Setup ist als aktive Bühne gewählt. Unten siehst du Playbook, Medien und verknüpfte Trades in breiten, ruhigeren Blöcken.'}
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-[#c8823a]/25 bg-[#c8823a]/10 px-3 py-1 text-xs text-[#f0a855]">
                  {selectedDetail?.category ?? selectedLibraryItem?.category ?? 'Setup'}
                </span>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <Metric label="Verknüpfte Trades" value={String(linkedTrades.length)} note="Echte Beispiele aus deinem Journal" />
              <Metric label="Beispielbilder" value={String(exampleCount)} note="Cover und zusätzliche Chart-Beispiele" />
              <Metric
                label="Playbook-Status"
                value={selectedDetail?.playbook?.length ? 'Bereit' : 'Offen'}
                note={
                  selectedDetail?.bestMarket && selectedDetail?.bestSession
                    ? `${selectedDetail.bestMarket} · ${selectedDetail.bestSession}`
                    : 'Playbook ergänzen, wenn der Rahmen klar ist'
                }
              />
            </div>
          </div>
        </div>
      </section>

      <SetupDetailCard title={selectedSetup} data={selectedDetail} linkedTrades={linkedTrades} />

      <section className="rounded-3xl border border-[#221e1a] bg-[#0d0d0d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-[#998a72]">Bibliothek</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Weitere Setups</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#998a72]">
              Jedes Setup bleibt nur ein ruhiger Klick entfernt. Die Bibliothek bleibt sekundär, damit der aktive Rahmen vorne nicht wieder vom Rest überrollt wird.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#998a72]">
            {setupLibrary.length} Setups
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {setupLibrary.map((setup) => (
            <SetupCard
              key={setup.title}
              setup={setup}
              coverImage={setupDetails[setup.title]?.coverImage}
              isActive={selectedSetup === setup.title}
              onClick={() => setSelectedSetup(setup.title)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <div className="mt-3 flex flex-col gap-1">
        <p className="text-lg font-semibold text-white">{value}</p>
        <p className="text-xs leading-5 text-white/45">{note}</p>
      </div>
    </div>
  )
}
