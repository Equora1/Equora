import {describe,it,expect} from 'vitest'
import {bindReviewDrilldownHref,readReviewDrilldownScope,selectReviewDrilldownTrades,type ReviewDrilldownScope} from '@/lib/utils/review-drilldown-scope'
import {buildTradeTableHref,parseTradeTableQuery} from '@/lib/utils/trade-table-query'
import type {Trade} from '@/lib/types/trade'
const scope:ReviewDrilldownScope={from:'2026-10-17T22:00:00.000Z',to:'2026-10-18T21:59:59.999Z',calculation:'finalized-outcomes-v3'}
function params(){return new URL(bindReviewDrilldownHref('/trades?tag=A',scope),'https://equora.invalid').searchParams}
describe('bounded versioned Review links',()=>{
 it('uses constant sized time bounds, retaining the signal filter',()=>{
  const p=params();expect(p.get('tag')).toBe('A');expect(readReviewDrilldownScope(p)).toEqual({kind:'valid',scope});expect(p.has('reviewTradeIds')).toBe(false)
  const query=parseTradeTableQuery(p),href=buildTradeTableHref(p.toString(),{...query,page:2})
  expect(readReviewDrilldownScope(new URL(href,'https://equora.invalid').searchParams)).toEqual({kind:'valid',scope})
 })
 it.each(['missing','version','invalid-date','reversed','duplicate'] as const)('rejects %s scope instead of reverting to an unbounded query',kind=>{
  const p=params();if(kind==='missing')p.delete('reviewTo');if(kind==='version')p.set('reviewCalculation','documented-outcomes-v2');if(kind==='invalid-date')p.set('reviewFrom','bad');if(kind==='reversed')p.set('reviewFrom','2027-01-01T00:00:00.000Z');if(kind==='duplicate')p.append('reviewFrom',scope.from)
  expect(readReviewDrilldownScope(p).kind).toBe('invalid')
 })
 it('keeps inclusive exact Berlin day bounds even when the UTC date differs',()=>{
  const base:Trade={id:'start',date:scope.from,tradeOccurredAt:scope.from,market:'TEST',setup:'Test',result:'',r:'',emotion:'',quality:'B-Setup',session:'London',concept:'',captureStatus:'complete',netPnL:10,accountCurrency:'EUR'}
  const rows=[base,{...base,id:'end',tradeOccurredAt:scope.to},{...base,id:'before',tradeOccurredAt:'2026-10-17T21:59:59.999Z'},{...base,id:'after',tradeOccurredAt:'2026-10-18T22:00:00.000Z'},{...base,id:'open',captureResult:'open' as const},{...base,id:'incomplete',captureStatus:'incomplete' as const},{...base,id:'conflict',captureResult:'loser' as const}]
  expect(selectReviewDrilldownTrades(rows,scope).map(t=>t.id)).toEqual(['start','end'])
 })
 it('does not turn library or external navigation into a trade query',()=>{
  expect(bindReviewDrilldownHref('/setups',scope)).toBe('/setups');expect(bindReviewDrilldownHref('https://example.com/trades',scope)).toBe('https://example.com/trades')
 })
})

describe('behavior predicate transport rejects incomplete evidence hints',()=>{
 it.each(['unknown','missing-value','unexpected-value','duplicate-match','value-only'])('rejects %s match data',kind=>{
  const p=new URL(bindReviewDrilldownHref('/trades',scope),'https://equora.invalid').searchParams
  if(kind==='unknown')p.set('reviewMatch','all');if(kind==='missing-value')p.set('reviewMatch','state');if(kind==='unexpected-value'){p.set('reviewMatch','reviewed');p.set('reviewValue','A')};if(kind==='duplicate-match'){p.append('reviewMatch','reviewed');p.append('reviewMatch','reviewed')};if(kind==='value-only')p.set('reviewValue','A')
  expect(readReviewDrilldownScope(p).kind).toBe('invalid')
 })
})
