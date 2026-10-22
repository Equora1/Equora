import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({availability:'ready',rows:[] as any[],tags:[] as any[],props:null as any,sessions:vi.fn()}))
vi.mock('next/link',()=>({default:({children,href}:any)=><a href={href}>{children}</a>}))
vi.mock('@/lib/server/auth',()=>({getJournalAccess:async()=>({user:{id:'owner'}})}))
vi.mock('@/lib/server/journal',()=>{
 const read=async()=>({availability:state.availability,tradeRows:state.rows,tradeTags:state.tags,setupRows:[],setupTradeLinkRows:[],dailyNotes:[],tradeMediaCounts:{},source:'supabase'})
 return {getReviewSnapshotServer:read,getTradesWorkspaceSnapshotServer:read}
})
vi.mock('@/lib/server/review-sessions',()=>({getReviewSessionsServer:async()=>{state.sessions();return []},getReviewSessionByIdServer:async()=>null}))
vi.mock('@/lib/server/user-cost-profiles',()=>({getUserCostProfilesServer:async()=>[]}))
vi.mock('@/lib/server/trades',()=>({getTradeByIdServer:async()=>null,getTradeMediaServer:async()=>[],getTradeTagsServer:async()=>[]}))
vi.mock('@/lib/server/performance',()=>({measurePerformance:(_n:any,_k:any,run:any)=>run(),measurePerformanceSync:(_n:any,_k:any,run:any)=>run()}))
vi.mock('@/components/layout/app-shell',()=>({AppShell:({children}:any)=><main>{children}</main>}))
vi.mock('@/components/review/review-summary-card',()=>({ReviewSummaryCard:()=>null}))
vi.mock('@/components/review/review-rhythm-card',()=>({ReviewRhythmCard:()=>null}))
vi.mock('@/components/trades/quick-trade-form',()=>({QuickTradeForm:()=>null}))
vi.mock('@/components/trades/trade-ledger-capture',()=>({TradeLedgerCapture:()=>null}))
vi.mock('@/components/trades/trade-form',()=>({TradeForm:()=>null}))
vi.mock('@/components/trades/trade-capture-deck',()=>({TradeCaptureDeck:()=>null}))
vi.mock('@/components/trades/close-trade-form',()=>({CloseTradeForm:()=>null}))
vi.mock('@/components/trades/trade-import-panel',()=>({TradeImportPanel:()=>null}))
vi.mock('@/components/trades/trades-workbench',()=>({TradesWorkbench:(props:any)=>{state.props=props;return null}}))
import ReviewPage from '@/app/(journal)/review/page'
import TradesPage from '@/app/(journal)/trades/page'
import {buildTradeTableView,buildTradeTagMap} from '@/lib/utils/trade-table'
import {buildReviewSnapshot} from '@/lib/utils/review'
import {mapTradeRowToTrade} from '@/lib/server/transformers'
import {readReviewDrilldownScope} from '@/lib/utils/review-drilldown-scope'
beforeEach(()=>{state.availability='ready';state.rows=[];state.tags=[];state.props=null;state.sessions.mockClear()})
describe('actual review route read boundary',()=>{
 it.each(['unavailable','unauthenticated'])('renders %s as an alert rather than an empty Journal',async availability=>{
  state.availability=availability
  const html=renderToStaticMarkup(await ReviewPage({}))
  expect(html).toContain('role="alert"');expect(html).toContain(availability==='unavailable'?'href="/review"':'href="/login"')
  expect(html).not.toContain('Noch keine Trades');expect(state.sessions).not.toHaveBeenCalled()
 })
 it('allows the genuine successful empty state',async()=>{
  const html=renderToStaticMarkup(await ReviewPage({}));expect(html).not.toContain('role="alert"');expect(state.sessions).toHaveBeenCalledTimes(1)
 })
})
describe('actual dynamic review drilldown retains every matching trade',()=>{
 it('keeps 45 matching IDs through pagination and export selection',async()=>{
  state.rows=Array.from({length:45},(_,i)=>({id:'trade-'+i,created_at:'2026-10-18T12:00:00Z',market:'TEST',setup:'Test',net_pnl:1,pnl_mode:'manual',account_currency:'USDT',capture_status:'complete'}))
  renderToStaticMarkup(await TradesPage({searchParams:Promise.resolve({reviewFocus:'Test',reviewOnly:'1'})}))
  const p=state.props;expect(p.spotlightTradeIds).toHaveLength(45);expect(p.spotlightTotalCount).toBe(45)
  const view=buildTradeTableView(p.trades,{},p.initialFilters,'newest',2,30,p.spotlightTradeIds)
  expect(view.totalMatches).toBe(45);expect(view.rows).toHaveLength(15);expect(view.matches).toHaveLength(45)
  expect(new Set(view.matches.map(t=>t.id)).size).toBe(45)
 })
})

describe('actual v3 signal to trade route preserves its selection',()=>{
 it('opens exactly the three final current trades behind a Tag signal',async()=>{
  const base={created_at:'2026-10-18T12:00:00Z',captured_at:'2026-10-18T12:00:00Z',market:'TEST',setup:'Test',net_pnl:10,pnl_mode:'manual',account_currency:'EUR',capture_status:'complete'}
  state.rows=[...Array.from({length:3},(_,i)=>({...base,id:'current-'+i})),{...base,id:'open',capture_result:'open',net_pnl:100},{...base,id:'incomplete',capture_status:'incomplete'},{...base,id:'conflict',capture_result:'loser'},{...base,id:'old',captured_at:'2026-10-09T12:00:00Z'}]
  state.tags=state.rows.map((r,i)=>({id:'tag-'+i,trade_id:r.id,tag:'A',created_at:r.created_at}))
  const snapshot=buildReviewSnapshot(state.rows.map(r=>mapTradeRowToTrade(r)),state.tags,[],'supabase')
  expect(snapshot.sessionDraft.netPnL).toBe(30)
  const href=snapshot.tagRadar.find(s=>s.label==='Stärkster Tag')!.href!
  const params=new URL(href,'https://equora.invalid').searchParams
  expect(readReviewDrilldownScope(params).kind).toBe('valid');expect(params.get('reviewOnly')).toBe('1')
  renderToStaticMarkup(await TradesPage({searchParams:Promise.resolve(Object.fromEntries(params))}))
  const p=state.props;expect(p.initialReviewOnly).toBe(true);expect(p.spotlightTradeIds.sort()).toEqual(['current-0','current-1','current-2'])
  const view=buildTradeTableView(p.trades,buildTradeTagMap(state.tags),p.initialFilters,'newest',2,2,p.spotlightTradeIds)
  expect(view.rows).toHaveLength(1);expect(view.matches).toHaveLength(3);expect(view.totalMatches).toBe(3)
 })
 it('does not silently widen an incomplete scope into the whole journal',async()=>{
  const html=renderToStaticMarkup(await TradesPage({searchParams:Promise.resolve({reviewFrom:'2026-10-18T00:00:00.000Z',reviewOnly:'1'})}))
  expect(html).toContain('role="alert"');expect(html).toContain('Review-Auswahl nicht verfügbar');expect(state.props).toBeNull()
 })
 it('retains legacy explicit saved IDs without a dynamic calculation scope',async()=>{
  state.rows=[{id:'saved-open',created_at:'2026-10-18T12:00:00Z',capture_result:'open',market:'TEST',setup:'Test'}]
  renderToStaticMarkup(await TradesPage({searchParams:Promise.resolve({reviewTradeIds:'saved-open',reviewOnly:'1'})}))
  expect(state.props.spotlightTradeIds).toEqual(['saved-open'])
 })
})

describe('behavior signal links carry both time and the actual evidence predicate',()=>{
 it('keeps reviewed, dominant-state and latest-lesson evidence in the real route',async()=>{
  const base={created_at:'2026-10-18T12:00:00Z',captured_at:'2026-10-18T12:00:00Z',market:'TEST',setup:'Test',net_pnl:10,pnl_mode:'manual',account_currency:'EUR',capture_status:'complete'}
  state.rows=[...Array.from({length:3},(_,i)=>({...base,id:'r-'+i,rule_check:i<2?'Ja':'Nein',review_repeatability:'Ja',review_state:i<2?'Fokussiert':'Impulsiv',review_lesson:i===0?'Plan behalten':null})),{...base,id:'unreviewed'},{...base,id:'lesson-only',review_lesson:'Auch nachbereitet'},{...base,id:'old',captured_at:'2026-10-09T12:00:00Z',rule_check:'Ja'},{...base,id:'open',capture_result:'open',rule_check:'Ja'}]
  const snapshot=buildReviewSnapshot(state.rows.map(r=>mapTradeRowToTrade(r)),[],[],'supabase')
  expect(snapshot.reviewLayer.highlights).toHaveLength(4)
  for(const signal of snapshot.reviewLayer.highlights){
   const params=new URL(signal.href!,'https://equora.invalid').searchParams
   expect(readReviewDrilldownScope(params).kind).toBe('valid')
   renderToStaticMarkup(await TradesPage({searchParams:Promise.resolve(Object.fromEntries(params))}))
   const ids=[...state.props.spotlightTradeIds].sort()
   expect(ids).toEqual(signal.label==='Dominanter Zustand'?['r-0','r-1']:signal.label==='Letzter Lerneffekt'?['r-0']:signal.label==='Regelspur'?['lesson-only','r-0','r-1','r-2']:['r-0','r-1','r-2'])
  }
 })
 it('binds all generated trade signal URLs including nested highlight groups',()=>{
  const trades=[mapTradeRowToTrade({id:'x',created_at:'2026-10-18T12:00:00Z',market:'TEST',setup:'Test',net_pnl:10,pnl_mode:'manual',account_currency:'EUR',capture_status:'complete',rule_check:'Ja',review_state:'Fokussiert',review_repeatability:'Ja',review_lesson:'Plan behalten'} as any)]
  const snapshot=buildReviewSnapshot(trades,[],[],'supabase');let checked=0
  function inspect(value:unknown){
   if(!value||typeof value!=='object')return
   for(const [key,item]of Object.entries(value)){
    if(key==='href'&&typeof item==='string'&&item.startsWith('/trades')){expect(readReviewDrilldownScope(new URL(item,'https://equora.invalid').searchParams).kind).toBe('valid');checked++}
    else inspect(item)
   }
  }
  inspect(snapshot);expect(checked).toBeGreaterThanOrEqual(4)
 })
})


describe('behavior state uses a meaningful state before the emotion fallback',()=>{
 it.each([null,undefined,'—','   ','Geduldig'])('keeps mapper placeholders out of the state predicate (%s)',async reviewState=>{
  const base={created_at:'2026-10-18T12:00:00Z',captured_at:'2026-10-18T12:00:00Z',market:'TEST',setup:'Test',net_pnl:10,pnl_mode:'manual',account_currency:'EUR',capture_status:'complete',rule_check:'Ja'}
  state.rows=[{...base,id:'target',review_state:reviewState,emotion:'Fokussiert'},{...base,id:'other',review_state:'Impulsiv',emotion:'Fokussiert'},{...base,id:'not-reviewed',rule_check:null,emotion:'Fokussiert'},{...base,id:'old',captured_at:'2026-10-09T12:00:00Z',emotion:'Fokussiert'},{...base,id:'open',capture_result:'open',emotion:'Fokussiert'}]
  const snapshot=buildReviewSnapshot(state.rows.map(r=>mapTradeRowToTrade(r)),[],[],'supabase')
  const signal=snapshot.reviewLayer.highlights.find(s=>s.label==='Dominanter Zustand')!
  const expected=reviewState==='Geduldig'?'Geduldig':'Fokussiert'
  expect(signal.value).toBe(expected);expect(signal.detail).toContain('1 Review-Trades')
  const params=new URL(signal.href!,'https://equora.invalid').searchParams
  expect(params.get('reviewValue')).toBe(expected)
  renderToStaticMarkup(await TradesPage({searchParams:Promise.resolve(Object.fromEntries(params))}))
  expect(state.props.spotlightTradeIds).toEqual(['target'])
  const view=buildTradeTableView(state.props.trades,{},state.props.initialFilters,'newest',1,30,state.props.spotlightTradeIds)
  expect(view.matches.map(t=>t.id)).toEqual(['target'])
 })
})
