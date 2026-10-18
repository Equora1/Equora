import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Trade } from '@/lib/types/trade'
import type { SetupDetail } from '@/lib/types/setup'
import { buildDynamicSetupDetail, buildSetupPerformanceRows } from '@/lib/utils/setup-analytics'
import { getSetupPerformanceDisplay } from '@/lib/utils/setup-performance-display'
import { SetupExplorer } from '@/components/setups/setup-explorer'
import { SetupDetailCard } from '@/components/setups/setup-detail-card'
import { SetupCard } from '@/components/setups/setup-card'
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
  it.each([1,2])('uses the correct dashboard noun for %i records needing attention', count => {
    const trades=Array.from({length:count},(_,i)=>trade({id:String(i),netPnL:10,accountCurrency:null}))
    const html=plain(renderToStaticMarkup(<DashboardOverview trades={trades} dailyNotes={[]} source="supabase" availability="ready" />))
    expect(html).toContain(count===1?'1 Eintrag noch prüfen.':'2 Einträge noch prüfen.')
  })
})
