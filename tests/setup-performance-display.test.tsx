import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Trade } from '@/lib/types/trade'
import type { SetupDetail } from '@/lib/types/setup'
import { buildDynamicSetupDetail, buildSetupPerformanceRows } from '@/lib/utils/setup-analytics'
import { getSetupPerformanceDisplay } from '@/lib/utils/setup-performance-display'
import { SetupStudioEditor } from '@/components/setups/setup-studio-editor'
import { SetupExplorer } from '@/components/setups/setup-explorer'
import { SetupDetailCard } from '@/components/setups/setup-detail-card'
import { SetupCard } from '@/components/setups/setup-card'
import { JournalLocaleProvider } from '@/components/layout/journal-locale-provider'
import { StatistikWorkbench } from '@/components/analytics/statistik-workbench'
import { DashboardOverview } from '@/components/dashboard/dashboard-overview'

vi.mock('next/link', () => ({ default: ({ href, children, prefetch, ...props }: any) => <a href={href} {...props}>{children}</a> }))

const title = 'Synthetic Setup'
const library = [{ title, category: 'Test', description: 'Synthetic rule' }]
const template: SetupDetail = { category:'Test',entry:'Entry rule',exit:'Exit rule',invalidation:'Invalidation rule',mistakes:[],bestMarket:'Template Market',bestSession:'Template Session',performance:'TEMPLATE-RESULT 9999 EUR 88% 9R' }
function trade(patch: Partial<Trade> = {}): Trade {
  return {id:'synthetic',date:'2026-05-08T10:00:00Z',market:'TEST',setup:title,result:'',r:'',emotion:'',quality:'B-Setup',session:'London',concept:'Test',captureStatus:'complete',accountCurrency:'EUR',...patch}
}
function row(trades: Trade[] = []) { return buildSetupPerformanceRows([title],trades)[0] }
function display(trades: Trade[] = []) { return getSetupPerformanceDisplay(row(trades)) }
function plain(html: string) { return html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim() }

describe('setup display distinguishes unavailable data from documented zero', () => {
  it('does not infer zero or missing currency from an empty setup', () => {
    const d=display()
    expect(d).toMatchObject({pnl:'—',winRate:'—',profitFactor:'—',averageR:'—',riskCoverage:'—',hasResults:false})
    expect(d.summary).toBe('Noch keine Trades für dieses Setup.')
    expect(d.summary).not.toContain('Währung')
  })
  it('does not describe a missing performance row as a known empty trade history', () => {
    expect(getSetupPerformanceDisplay().summary).toBe('Noch keine Auswertung verfügbar.')
  })
  it.each([1,3])('hides rates and money for %i trades without results', count => {
    const d=display(Array.from({length:count},(_,i)=>trade({id:String(i)})))
    expect(d).toMatchObject({pnl:'—',winRate:'—',profitFactor:'—',averageR:'R offen',hasResults:false})
    expect(d.summary).toBe('Noch keine auswertbaren Ergebnisse.')
  })
  it.each(['open','incomplete'] as const)('does not fabricate results for %s captures without P&L', state => {
    const d=display([trade(state==='open'?{captureResult:'open'}:{captureStatus:'incomplete'})])
    expect(d.hasResults).toBe(false)
    expect(d.profitFactor).toBe('—')
    expect(d.winRate).toBe('—')
  })
  it.each(['','—','not a result'])('does not turn missing legacy result %j into a last-trade zero', result => {
    const r=row([trade({result})])
    expect(r.lastTradePnL).toBeNull()
    expect(r.resolvedTrades).toBe(0)
  })
  it('uses the same Berlin trade day for the latest setup trade in both languages', () => {
    const trades = [trade({ tradeOccurredAt: '2026-05-08T22:15:00Z' })]

    expect(buildSetupPerformanceRows([title], trades, [], 'de')[0].lastTradeDate).toBe('09.05.26')
    expect(buildSetupPerformanceRows([title], trades, [], 'en')[0].lastTradeDate).toBe('09/05/26')
  })
  it('retains documented monetary zero, zero win rate and zero R while hiding undefined 0/0 PF', () => {
    const d=display([trade({netPnL:0,rValue:0,rSource:'manual'})])
    expect(d.pnl).toBe('+0 EUR')
    expect(d.winRate).toBe('0%')
    expect(d.averageR).toBe('+0,00R')
    expect(d.profitFactor).toBe('—')
  })
  it('retains a defined zero profit factor for a loss-only sample', () => {
    const d=display([trade({netPnL:-10})])
    expect(d.profitFactor).toBe('0.00')
    expect(d.winRate).toBe('0%')
    expect(d.pnl).toBe('-10 EUR')
  })
  it('preserves the existing infinity convention for profits with no losses', () => {
    const d=display([trade({netPnL:10})])
    expect(d.profitFactor).toBe('∞')
    expect(d.winRate).toBe('100%')
  })
  it('retains a real net zero with a defined quotient', () => {
    const d=display([trade({id:'win',netPnL:10}),trade({id:'loss',netPnL:-10})])
    expect(d.pnl).toBe('+0 EUR')
    expect(d.profitFactor).toBe('1.00')
    expect(d.winRate).toBe('50%')
  })
  it.each([null,'mixed'] as const)('blocks monetary defaults for %s currency scope without hiding the observed win fraction', currency => {
    const rows=currency==='mixed'?[trade({netPnL:10}),trade({id:'usd',netPnL:-10,accountCurrency:'USD'})]:[trade({netPnL:10,accountCurrency:null})]
    const d=display(rows)
    expect(d.pnl).toBe('Gesperrt')
    expect(d.profitFactor).toBe('—')
    expect(d.moneyNote).toContain(currency==='mixed'?'mehrere Währungen':'Währung fehlt oder wird nicht unterstützt')
    expect(d.winRate).toBe(currency==='mixed'?'50%':'100%')
  })
  it('does not promote planned R to a documented result', () => {
    expect(display([trade({netPnL:0,rValue:2,rSource:'planned'})]).averageR).toBe('R offen')
  })
  it('never copies template performance or template rankings into an empty personal detail', () => {
    const d=buildDynamicSetupDetail(template,[])!
    expect(d.performance).toBe('Noch keine Trades für dieses Setup.')
    expect(d.bestMarket).toBe('—')
    expect(d.bestSession).toBe('—')
    expect(d.entry).toBe(template.entry)
    expect(d.exit).toBe(template.exit)
  })
})

describe('actual Journal surfaces use the same setup availability contract', () => {
  it('renders an empty explorer and detail without fake rates or template results', () => {
    const html=plain(renderToStaticMarkup(<SetupExplorer setupLibrary={library} setupDetails={{[title]:template}} trades={[]} savedSetups={[]} setupPerformanceRows={[row()]} />))
    expect(html).toContain('Noch keine Trades für dieses Setup.')
    expect(html).not.toContain('0%')
    expect(html).not.toContain('0.00')
    expect(html).not.toContain('Währung fehlt')
    expect(html).not.toContain('TEMPLATE-RESULT')
    expect(html).not.toContain('Keine Schwäche sichtbar')
  })
  it('does not use template metrics when the detail has no performance row', () => {
    const html=plain(renderToStaticMarkup(<SetupDetailCard title={title} data={template} linkedTrades={[]} />))
    expect(html).toContain('Noch keine Auswertung verfügbar.')
    expect(html).not.toContain('TEMPLATE-RESULT')
  })
  it('renders resultless setup cards with unavailable metrics rather than zeros', () => {
    const html=plain(renderToStaticMarkup(<SetupCard setup={library[0]} performance={row([trade()])} />))
    expect(html).toContain('Winrate — PF —')
    expect(html).not.toContain('0.00')
    expect(html).not.toContain('Währung fehlt')
  })
  it('preserves a real loss-only PF zero on the setup card and detail', () => {
    const trades=[trade({netPnL:-10})],performance=row(trades)
    expect(plain(renderToStaticMarkup(<SetupCard setup={library[0]} performance={performance} />))).toContain('PF 0.00')
    expect(plain(renderToStaticMarkup(<SetupDetailCard title={title} data={template} linkedTrades={trades} performance={performance} />))).toContain('PF 0.00')
  })
  it('keeps the Statistics sample gate and masks a break-even-only setup PF at its boundary', () => {
    const trades=Array.from({length:5},(_,i)=>trade({id:String(i),setup:i<3?title:'Other',netPnL:i<3?0:10}))
    const html=plain(renderToStaticMarkup(<StatistikWorkbench trades={trades} tradeTags={[]} setupTitles={[title,'Empty']} initialLayer="setups" />))
    expect(html).toContain('Synthetic Setup')
    expect(html).toContain('Trefferquote 0% PF —')
    expect(html).not.toContain('PF 0.00')
    const small=plain(renderToStaticMarkup(<StatistikWorkbench trades={trades.slice(0,2)} tradeTags={[]} setupTitles={[title]} initialLayer="setups" />))
    expect(small).toContain('Für Vergleiche liegen noch zu wenige Trades vor.')
  })
  it('uses English labels for the same setup selection, Berlin window and P&L', () => {
    const setup = 'Eigener Rücklauf'
    const trades = Array.from({ length: 6 }, (_, index) => trade({
      id: String(index),
      setup: index < 5 ? setup : 'Other',
      date: '2026-07-01T06:30:00Z',
      netPnL: index < 5 ? 10 : -100,
      accountCurrency: 'USDT',
    }))
    const workbench = <StatistikWorkbench trades={trades} tradeTags={[]} setupTitles={[setup, 'Other']} initialSetup={setup} />
    const german = plain(renderToStaticMarkup(workbench))
    const english = plain(renderToStaticMarkup(<JournalLocaleProvider locale="en">{workbench}</JournalLocaleProvider>))

    expect(german).toContain('5 passend')
    expect(german).toContain('08–10 Uhr')
    expect(english).toContain('5 matched')
    expect(english).toContain('08:00–10:00')
    expect(english).toContain('recorded time (Berlin)')
    expect(english).toContain(`Setup: ${setup}`)
    expect(english).toContain('Win rate 100.0%')
    for (const screen of [german, english]) expect(screen).toContain('50 USDT')
  })

  it.each([
    ['setups', 'Historical results for setups with enough trades'],
    ['psychology', 'Current winning streak'],
    ['drawdown', 'Longest recovery'],
    ['curves', 'P&amp;L chart'],
    ['deepdive', 'Compare results by category'],
  ])('renders the English %s section with enough trades to compare', (initialLayer, caption) => {
    const trades = Array.from({ length: 6 }, (_, index) => trade({
      id: String(index),
      setup: index < 3 ? title : 'Other',
      netPnL: index < 3 ? 10 : -5,
    }))
    const html = plain(renderToStaticMarkup(
      <JournalLocaleProvider locale="en">
        <StatistikWorkbench trades={trades} tradeTags={[]} setupTitles={[title, 'Other']} initialLayer={initialLayer} />
      </JournalLocaleProvider>,
    ))
    expect(html).toContain(caption)
    expect(html).toContain('6 matched')
  })

  it('displays setup results in their own currencies without ranking mixed amounts', () => {
    const trades = Array.from({ length: 6 }, (_, index) => trade({
      id: String(index),
      setup: index < 3 ? 'Alpha' : 'Zulu',
      accountCurrency: index < 3 ? 'EUR' : 'USDT',
      netPnL: index < 3 ? 10 : 100,
    }))
    const html = plain(renderToStaticMarkup(
      <JournalLocaleProvider locale="en">
        <StatistikWorkbench trades={trades} tradeTags={[]} setupTitles={['Alpha', 'Zulu']} initialLayer="setups" />
      </JournalLocaleProvider>,
    ))
    expect(html).toContain('Setup P&amp;L can only be compared when results use the same currency.')
    expect(html).toContain('300 USDT')
    expect(html).not.toContain('had the highest')
    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('Zulu'))
  })

  it('localizes the setup detail while displaying saved rules and captions verbatim', () => {
    const linkedTrades = [trade({ netPnL: 5, accountCurrency: 'USDT' })]
    const data = {
      ...template,
      entry: 'Nur nach Rücklauf einsteigen.',
      exampleImageItems: [{ url: '/fixture.png', mediaRole: 'mistake' as const, caption: 'Zu früh eingestiegen.' }],
    }
    const html = plain(renderToStaticMarkup(
      <JournalLocaleProvider locale="en">
        <SetupDetailCard title={title} data={data} linkedTrades={linkedTrades} performance={row(linkedTrades)} />
      </JournalLocaleProvider>,
    ))
    expect(html).toContain('Setup rules')
    expect(html).toContain('Linked trades')
    expect(html).toContain('5 USDT')
    expect(html).toContain('Nur nach Rücklauf einsteigen.')
    expect(html).toContain('Zu früh eingestiegen.')
    expect(html).toContain('Mistake example')
  })

  it('keeps the original editor values while translating the image role and archive controls', () => {
    const noop = () => {}
    const html = renderToStaticMarkup(
      <JournalLocaleProvider locale="en">
        <SetupStudioEditor
          editorRef={{ current: null }} titleInputRef={{ current: null }} fileInputRef={{ current: null }}
          isCreatingNew={false} draftTitle="Basic details"
          draft={{
            id: 'setup-1', title: 'Rücklauf', category: 'Custom', description: '', entry: 'Regel prüfen',
            exit: '', invalidation: '', playbook: '', checklist: '', mistakes: '', isArchived: true, isMaster: false,
            sortOrder: 0, linkedTradeIds: [],
            media: [{ tempId: 'image-1', storagePath: 'demo/image.png', publicUrl: '/fixture.png',
              previewUrl: '/fixture.png', persisted: true, sortOrder: 0, isCover: false,
              mediaRole: 'mistake', caption: 'Originaler Bildtext' }],
          }}
          canManageMaster={false} canEditDraft activeExtraSection="status" onSetActiveExtraSection={noop}
          tradeLinkQuery="" onSetTradeLinkQuery={noop} tradeLinkOptions={[]} filteredTradeLinkOptions={[]}
          dragActive={false} onSetDragActive={noop} status="" onApplyDraft={noop}
          onFileChange={noop} onDrop={noop} onUpdateMedia={noop} onMoveMedia={noop} onMarkAsCover={noop}
          onToggleLinkedTrade={noop} onRemoveMedia={noop} onDelete={noop}
        />
      </JournalLocaleProvider>,
    )
    expect(html).toContain('value="Rücklauf"')
    expect(html).toContain('>Regel prüfen</textarea>')
    expect(html).toContain('checked=""')
    expect(html).toContain('>Delete setup</button>')
    expect(html).toContain('<option value="mistake" selected="">Mistake example</option>')
    expect(html).toContain('>Originaler Bildtext</textarea>')
  })

  it.each([1,2])('uses the correct dashboard noun for %i records needing attention', count => {
    const trades=Array.from({length:count},(_,i)=>trade({id:String(i),netPnL:10,accountCurrency:null}))
    const html=plain(renderToStaticMarkup(<DashboardOverview trades={trades} dailyNotes={[]} source="supabase" availability="ready" />))
    expect(html).toContain(count===1?'1 Eintrag noch prüfen.':'2 Einträge noch prüfen.')
  })
})

describe('setup rankings respect currency and history preserves precision',()=>{
 it.each(['mixed','missing'] as const)('hides money rankings for %s units',scope=>{
  const trades=Array.from({length:8},(_,i)=>trade({id:String(i),netPnL:i+1,market:i<4?'AAA':'BBB',session:i<4?'London':'New York',accountCurrency:i<4?'EUR':scope==='mixed'?'USD':null}))
  expect(row(trades)).toMatchObject({bestSession:'—',weakestSession:'—',bestMarket:'—',weakestMarket:'—'})
  expect(buildDynamicSetupDetail(template,trades)).toMatchObject({bestMarket:'—',bestSession:'—'})
 })
 it.each([0.004,-0.002])('shows the actual tiny amount %s with unit',netPnL=>{
  const trades=[trade({netPnL,accountCurrency:'USDT'})]
  const html=plain(renderToStaticMarkup(<SetupDetailCard title={title} data={template} linkedTrades={trades} performance={row(trades)} />))
  expect(html).toContain(netPnL>0?'+0,004 USDT':'-0,002 USDT')
 })
 it('does not present an amount without its missing unit warning',()=>{
  const trades=[trade({netPnL:0.004,accountCurrency:null})]
  const html=plain(renderToStaticMarkup(<SetupDetailCard title={title} data={template} linkedTrades={trades} performance={row(trades)} />))
  expect(html).toContain('Währung fehlt')
 })
})
