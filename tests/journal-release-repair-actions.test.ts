import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({client:vi.fn(),env:vi.fn(),revalidate:vi.fn()}))
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidate}))
vi.mock('@/lib/supabase/config',()=>({hasSupabaseClientEnv:mocks.env}))
vi.mock('@/lib/supabase/server-auth',()=>({createSupabaseAuthServerClient:mocks.client}))
vi.mock('@/lib/server/media-cleanup',()=>({processMediaCleanupForPaths:vi.fn()}))
import {createTradeEntry,updateTradeEntry} from '@/app/actions/trades'
import {mapTradeRowToTrade} from '@/lib/server/transformers'
import {buildReviewSnapshotSummary} from '@/lib/utils/review-snapshot-summary'
import {getPartialExitPlanInfo,deriveEffectiveExitFromPartialExitLegs} from '@/lib/utils/calculations'
import type {TradeCaptureInput} from '@/lib/utils/trade-validation'
import type {TradeRow} from '@/lib/types/db'
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
function input(patch:Partial<TradeCaptureInput>={}):TradeCaptureInput{
 const fields='market setup emotion bias ruleCheck reviewRepeatability reviewState reviewLesson tradeOccurredAt entry stopLoss takeProfit exit netPnL riskPercent accountSize marginUsed rMultiple pnlMode costProfile brokerProfile instrumentType accountTemplate marketTemplate positionSize pointValue fees exchangeFees fundingFees fundingRateBps fundingIntervals spreadCost slippage accountCurrency cryptoMarketType executionType fundingDirection quoteAsset leverage userCostProfileId notes'.split(' ')
 return {...Object.fromEntries(fields.map(k=>[k,''])),market:'TEST',setup:'Test',bias:'Long',tradeOccurredAt:'2026-10-18T12:00',entry:'100',stopLoss:'90',exit:'115',positionSize:'2',pnlMode:'auto',costProfile:'none',brokerProfile:'manual',instrumentType:'stocks',accountCurrency:'EUR',partialExit1Percent:'50',partialExit1Price:'120',notes:'Bestehende Notiz',tags:[],...patch} as TradeCaptureInput
}
function client(error:unknown=null){
 const rpc=vi.fn().mockResolvedValue({data:{tradeId:id,alreadyApplied:false},error})
 const query={limit:vi.fn().mockReturnThis(),select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:{id,created_at:'2026-10-18T10:00:00Z',notes:'Bestehende Notiz'},error:null})}
 mocks.client.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:owner}}})},rpc,from:vi.fn().mockReturnValue(query)})
 return {rpc,query}
}
beforeEach(()=>{vi.clearAllMocks();mocks.env.mockReturnValue(true)})
describe('real full trade actions use the durable contract',()=>{
 it.each(['create','update'])('%s sends weighted price, basis and notes, then maps the serialized record without loss',async kind=>{
  const {rpc}=client(),values=input()
  const result=kind==='create'?await createTradeEntry(values):await updateTradeEntry(id,values)
  expect(result.success,result.message).toBe(true)
  expect(rpc).toHaveBeenCalledTimes(1)
  const [name,args]=rpc.mock.calls[0];expect(name).toBe(kind==='create'?'equora_create_trade_v2':'equora_update_trade_v2')
  expect(args.p_trade).toMatchObject({exit:117.5,exit_price_basis:'weighted-remainder-v1',notes:'Bestehende Notiz'})
  const stored=JSON.parse(JSON.stringify({...args.p_trade,id:args.p_trade_id,created_at:'2026-10-18T10:00:00Z'})) as TradeRow
  expect(mapTradeRowToTrade(stored)).toMatchObject({netPnL:35,rValue:1.75})
 })
 it('leaves an actual open remainder unasserted',async()=>{
  const {rpc}=client();const result=await updateTradeEntry(id,input({exit:'',pnlMode:'manual',netPnL:'20'}));expect(result.success,result.message).toBe(true)
  expect(rpc.mock.calls[0][1].p_trade).toMatchObject({exit:null,exit_price_basis:null})
 })
 it('does not retry or fall back when the v2 contract is absent',async()=>{
  const {rpc}=client({message:'function equora_update_trade_v2 does not exist'})
  expect((await updateTradeEntry(id,input())).success).toBe(false);expect(rpc).toHaveBeenCalledTimes(1);expect(mocks.revalidate).not.toHaveBeenCalled()
 })
})

describe('small real remainders require an explicit closing price',()=>{
 it.each([99.999,99.9995])('rejects an automatic full save with %s percent and no final exit',async percent=>{
  const {rpc}=client();const result=await createTradeEntry(input({exit:'',partialExit1Percent:String(percent)}))
  expect(result.success).toBe(false);expect(rpc).not.toHaveBeenCalled()
 })
 it.each([99.999,99.9995])('does not stamp a missing exit in update at %s percent',async percent=>{
  for(const bias of ['Long','Short']){
   const {rpc}=client(),price=bias==='Long'?120:80,net=2*(price===120?20:20)*percent/100
   const result=await updateTradeEntry(id,input({exit:'',partialExit1Percent:String(percent),partialExit1Price:String(price),bias,stopLoss:bias==='Long'?'90':'110',pnlMode:'manual',netPnL:String(net)}))
   expect(result.success,result.message).toBe(true)
   const stored=JSON.parse(JSON.stringify({...rpc.mock.calls[0][1].p_trade,id,created_at:'2026-10-18T12:00:00Z'})) as TradeRow
   expect(stored).toMatchObject({exit:null,exit_price_basis:null})
   const trade=mapTradeRowToTrade(stored);expect(trade.partialExitHasOpenRemainder).toBe(true)
   expect(buildReviewSnapshotSummary([trade],[])).toMatchObject({winners:0,losers:0,rCount:0,netPnL:0,bestTradeId:null})
  }
 })
 it.each([99.999,99.9995])('still saves a confirmed close at %s percent for Long and Short',async percent=>{
  for(const bias of ['Long','Short']){
   const {rpc}=client(),price=bias==='Long'?120:80,exit=bias==='Long'?115:85
   const result=await updateTradeEntry(id,input({bias,stopLoss:bias==='Long'?'90':'110',exit:String(exit),partialExit1Percent:String(percent),partialExit1Price:String(price)}))
   expect(result.success,result.message).toBe(true)
   const payload=rpc.mock.calls[0][1].p_trade;expect(payload.exit_price_basis).toBe('weighted-remainder-v1')
   const expected=deriveEffectiveExitFromPartialExitLegs({exit,partialExits:[{percent,price}]})!
   expect(payload.exit).toBeCloseTo(expected,10)
   const trade=mapTradeRowToTrade({...payload,id,created_at:'2026-10-18T12:00:00Z'});expect(trade.partialExitHasOpenRemainder).toBe(false)
   expect(buildReviewSnapshotSummary([trade],[]).winners).toBe(1)
  }
 })
 it.each([null,'',undefined])('preserves the actual open status for a missing final input %s',exit=>{
  expect(getPartialExitPlanInfo({exit,partialExits:[{percent:99.9995,price:120}]})).toMatchObject({hasRemainder:true,hasOpenRemainder:true,effectiveExit:null})
 })
 it.each([99.9998,99.9999,100])('uses the documented four-decimal tolerance at %s percent',percent=>{
  const plan=getPartialExitPlanInfo({exit:null,partialExits:[{percent,price:120}]})
  expect(plan.hasOpenRemainder).toBe(percent===99.9998);expect(plan.hasRemainder).toBe(percent===99.9998)
 })
})
