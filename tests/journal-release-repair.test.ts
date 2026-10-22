import {describe,it,expect} from 'vitest'
import {buildReviewSnapshotSummary,getSavedReviewRValue,haveComparableReviewCalculations,isCurrentReviewCalculation,hasVerifiedReviewCalculation,REVIEW_CALCULATION_VERSION} from '@/lib/utils/review-snapshot-summary'
import {buildReviewSnapshot} from '@/lib/utils/review'
import {mapTradeRowToTrade} from '@/lib/server/transformers'
import {deriveEffectiveExitFromPartialExitLegs,restoreRemainderExitFromStoredAverage} from '@/lib/utils/calculations'
import {getExitPriceBasis,WEIGHTED_EXIT_PRICE_BASIS} from '@/lib/utils/trade-exit-basis'
import type {TradeRow} from '@/lib/types/db'
const row:TradeRow={id:'sample',created_at:'2026-10-18T12:00:00Z',market:'TEST',setup:'Test',emotion:null,bias:'Long',rule_check:null,entry:100,stop_loss:90,take_profit:120,exit:110,net_pnl:10,pnl_mode:'manual',risk_percent:null,r_multiple:null,notes:null,screenshot_url:null,account_currency:'EUR',capture_status:'complete',position_size:2}
describe('finalized review outcomes v3',()=>{
 it.each([{capture_result:'open'},{capture_status:'incomplete'},{capture_result:'loser'},{exit:null,partial_exits:[{percent:50,price:120}]}] as Partial<TradeRow>[])('excludes unfinished or conflicting results %j while retaining selected scope',patch=>{
  const trades=[mapTradeRowToTrade({...row,...patch})],summary=buildReviewSnapshotSummary(trades,[])
  expect(summary).toMatchObject({tradeCount:1,tradeIds:['sample'],netPnL:0,winners:0,losers:0,breakeven:0,winRate:0,rCount:0,excludedRCount:1,bestTradeId:null,worstTradeId:null})
  expect(buildReviewSnapshot(trades,[],[],'supabase').sessionDraft).toEqual(summary)
 })
 it('computes the finished denominator independently of a large open profit',()=>{
  const trades=[row,{...row,id:'loss',net_pnl:-5},{...row,id:'flat',net_pnl:0},{...row,id:'open',net_pnl:999,capture_result:'open' as const}].map(r=>mapTradeRowToTrade(r))
  expect(buildReviewSnapshotSummary(trades,[])).toMatchObject({netPnL:5,tradeCount:4,winners:1,losers:1,breakeven:1,winRate:(1/3)*100,bestTradeId:'sample',worstTradeId:'loss'})
 })
 it('keeps winrate evidence when the money unit is missing',()=>{
  expect(buildReviewSnapshotSummary([mapTradeRowToTrade({...row,account_currency:null})],[])).toMatchObject({winners:1,winRate:100,netPnL:0,currency:null,monetaryScopeKind:'unknown'})
 })
 it('retains verified v2 history without comparing it to v3',()=>{
  const old={calculationVersion:'documented-outcomes-v2',averageR:0,rCount:1,excludedRCount:0,tradeCount:1},current={...old,calculationVersion:REVIEW_CALCULATION_VERSION}
  expect(hasVerifiedReviewCalculation(old)).toBe(true);expect(isCurrentReviewCalculation(old)).toBe(false);expect(getSavedReviewRValue(old)).toBe(0)
  expect(haveComparableReviewCalculations(old,old)).toBe(true);expect(haveComparableReviewCalculations(old,current)).toBe(false)
 })
})
describe('durable owner-confirmed exit basis through serialization and read',()=>{
 it.each([['Long',120,115,117.5,35,1.75],['Short',80,85,82.5,35,1.75]] as const)('%s weights the remainder once and preserves P&L and R on repeated reads', (bias,partial,final,average,pnl,r)=>{
  const legs=[{percent:50,price:partial}],effective=deriveEffectiveExitFromPartialExitLegs({exit:final,partialExits:legs})
  expect(effective).toBe(average)
  const stored=JSON.parse(JSON.stringify({...row,bias,stop_loss:bias==='Long'?90:110,pnl_mode:'auto',net_pnl:null,exit:effective,partial_exits:legs,exit_price_basis:getExitPriceBasis(final,legs)})) as TradeRow
  expect(stored.exit_price_basis).toBe(WEIGHTED_EXIT_PRICE_BASIS)
  expect(mapTradeRowToTrade(stored)).toMatchObject({netPnL:pnl,rValue:r})
  const restored=restoreRemainderExitFromStoredAverage({exit:stored.exit,partialExits:legs})
  expect(restored).toBe(final);expect(deriveEffectiveExitFromPartialExitLegs({exit:restored,partialExits:legs})).toBe(average)
  expect(mapTradeRowToTrade({...stored,exit:average})).toMatchObject({netPnL:pnl,rValue:r})
  expect(mapTradeRowToTrade({...stored,exit_price_basis:null}).netPnL).toBeUndefined()
 })
 it('does not assert a missing or fully covered remainder',()=>{
  expect(getExitPriceBasis(null,[{percent:50,price:120}])).toBeNull()
  expect(getExitPriceBasis(115,[{percent:100,price:120}])).toBeNull()
  expect(getExitPriceBasis(115,[])).toBeNull()
 })
})

describe('small valid remainders share one persistence threshold',()=>{
 it.each([50,99,99.99,99.999,99.9995])('restores and reweights the explicit exit at %s percent coverage',percent=>{
  const legs=[{percent,price:120}],average=deriveEffectiveExitFromPartialExitLegs({exit:115,partialExits:legs})!
  expect(getExitPriceBasis(115,legs)).toBe(WEIGHTED_EXIT_PRICE_BASIS)
  const final=restoreRemainderExitFromStoredAverage({exit:average,partialExits:legs})
  expect(final).toBeCloseTo(115,4);expect(deriveEffectiveExitFromPartialExitLegs({exit:final,partialExits:legs})).toBeCloseTo(average,10)
 })
})
