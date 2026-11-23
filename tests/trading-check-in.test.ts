import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTradingCheckIn, saveTradingCheckIn } from '@/app/actions/trading-check-in'
import {
  changeCheckInAnswer,
  checkInColumns,
  getCheckInQuestions,
  parseCheckInDraft,
  type CheckInDraft,
} from '@/lib/utils/trading-check-in'

const mocks = vi.hoisted(() => ({
  request: vi.fn<typeof fetch>(),
  user: vi.fn(),
  enabled: vi.fn(),
}))

vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: mocks.enabled }))
vi.mock('@/lib/supabase/server-auth', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient('https://check-in-fixture.invalid', 'test-only', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: mocks.request },
  })
  return {
    createSupabaseAuthServerClient: async () => ({
      auth: { getUser: mocks.user },
      from: client.from.bind(client),
    }),
  }
})

const date = '2026-11-21'
const userId = '11111111-1111-1111-1111-111111111111'
const ratedBefore: CheckInDraft = { answers: { recovery: 4, focus: 5 }, noTrades: false }
const noTrades: CheckInDraft = { answers: {}, noTrades: true }
const skipped: CheckInDraft = { answers: {}, noTrades: false }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
})

function requestAt(index = 0) {
  const [input, options] = mocks.request.mock.calls[index]
  return { url: new URL(String(input)), options }
}

beforeEach(() => {
  mocks.request.mockReset()
  mocks.enabled.mockReset().mockReturnValue(true)
  mocks.user.mockReset().mockResolvedValue({ data: { user: { id: userId } }, error: null })
})

describe('trading check-in answers', () => {
  it('offers the entry question only after a reported deviation', () => {
    const deviation: CheckInDraft = { answers: { plan_adherence: 3, entry_signal: 2 }, noTrades: false }
    expect(getCheckInQuestions('after', deviation)).toEqual(['confidence', 'plan_adherence', 'entry_signal'])
    const followed = changeCheckInAnswer(deviation, 'plan_adherence', 5)
    expect(getCheckInQuestions('after', followed)).toEqual(['confidence', 'plan_adherence'])
    expect(followed.answers).toEqual({ plan_adherence: 5 })
    expect(changeCheckInAnswer(deviation, 'plan_adherence', null).answers).toEqual({})
    expect(getCheckInQuestions('after', noTrades)).toEqual([])
  })

  it.each([
    { answers: { focus: 6 }, noTrades: false },
    { answers: { focus: '4' }, noTrades: false },
    { answers: { plan_adherence: 3 }, noTrades: false },
    { answers: {}, noTrades: true },
  ])('rejects invalid preparation values %j', (draft) => {
    expect(parseCheckInDraft('before', draft)).toBeNull()
  })
})

describe('trading check-in actions', () => {
  it('validates dates and signed-in users before contacting the check-in table', async () => {
    await expect(loadTradingCheckIn('2026-02-30')).resolves.toEqual({ ok: false, reason: 'invalid' })
    await expect(saveTradingCheckIn({ date, phase: 'after', draft: ratedBefore, previous: null }))
      .resolves.toEqual({ ok: false, reason: 'invalid' })
    mocks.user.mockResolvedValue({ data: { user: null }, error: null })
    await expect(loadTradingCheckIn(date)).resolves.toEqual({ ok: false, reason: 'signed_out' })
    await expect(saveTradingCheckIn({ date, phase: 'before', draft: ratedBefore, previous: null }))
      .resolves.toEqual({ ok: false, reason: 'signed_out' })
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('loads both phases only for the signed-in user and selected date', async () => {
    mocks.request.mockResolvedValueOnce(json([
      { phase: 'before', ...checkInColumns(ratedBefore) },
      { phase: 'after', ...checkInColumns(noTrades) },
    ]))
    await expect(loadTradingCheckIn(date)).resolves.toEqual({ ok: true, day: { before: ratedBefore, after: noTrades } })
    const { url } = requestAt()
    expect(url.pathname).toBe('/rest/v1/trading_check_ins')
    expect(url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(url.searchParams.get('trade_date')).toBe(`eq.${date}`)
  })

  it('reports unavailable storage and does not offer an empty day after a load error', async () => {
    mocks.request.mockResolvedValueOnce(json({ code: '42P01', message: 'table missing' }, 404))
    await expect(loadTradingCheckIn(date)).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it('stores a no-trade day with the authenticated owner, not a caller-supplied owner', async () => {
    mocks.request.mockResolvedValueOnce(new Response(null, { status: 201 }))
    await expect(saveTradingCheckIn({ date, phase: 'after', draft: noTrades, previous: null, userId: 'other' }))
      .resolves.toEqual({ ok: true, value: noTrades })
    const { options } = requestAt()
    expect(options?.method).toBe('POST')
    expect(JSON.parse(String(options?.body))).toEqual({
      user_id: userId, trade_date: date, phase: 'after', ...checkInColumns(noTrades),
    })
  })

  it('leaves an entirely skipped new phase unwritten', async () => {
    await expect(saveTradingCheckIn({ date, phase: 'before', draft: skipped, previous: null }))
      .resolves.toEqual({ ok: true, value: null })
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('limits edits to the loaded phase and the exact previous answers', async () => {
    const draft: CheckInDraft = { answers: { recovery: 3 }, noTrades: false }
    mocks.request.mockResolvedValueOnce(json({ phase: 'before' }))
    await expect(saveTradingCheckIn({ date, phase: 'before', draft, previous: ratedBefore }))
      .resolves.toEqual({ ok: true, value: draft })
    const { url, options } = requestAt()
    expect(options?.method).toBe('PATCH')
    expect(url.searchParams.get('user_id')).toBe(`eq.${userId}`)
    expect(url.searchParams.get('phase')).toBe('eq.before')
    expect(url.searchParams.get('confidence')).toBe('is.null')
    expect(url.searchParams.get('focus')).toBe('eq.5')
    expect(url.searchParams.get('no_trades')).toBe('eq.false')
    expect(JSON.parse(String(options?.body))).toEqual(checkInColumns(draft))
  })

  it('does not overwrite a more recent save with changes from an old dialog', async () => {
    mocks.request.mockResolvedValueOnce(json(null))
    mocks.request.mockResolvedValueOnce(json([{ phase: 'before', ...checkInColumns(ratedBefore) }]))
    await expect(saveTradingCheckIn({
      date, phase: 'before', previous: { answers: { focus: 2 }, noTrades: false },
      draft: { answers: { focus: 1 }, noTrades: false },
    })).resolves.toEqual({ ok: false, reason: 'changed' })
    expect(mocks.request).toHaveBeenCalledTimes(2)
    expect(requestAt(1).options?.method).toBe('GET')
  })

  it('acknowledges a retried insert when exactly the same answers already exist', async () => {
    mocks.request.mockResolvedValueOnce(json({ code: '23505', message: 'duplicate' }, 409))
    mocks.request.mockResolvedValueOnce(json([{ phase: 'before', ...checkInColumns(ratedBefore) }]))
    await expect(saveTradingCheckIn({ date, phase: 'before', previous: null, draft: ratedBefore }))
      .resolves.toEqual({ ok: true, value: ratedBefore })
    expect(mocks.request).toHaveBeenCalledTimes(2)
  })

  it('clears only an existing phase after the user skips all answers and saves', async () => {
    mocks.request.mockResolvedValueOnce(json({ phase: 'after' }))
    await expect(saveTradingCheckIn({ date, phase: 'after', previous: noTrades, draft: skipped }))
      .resolves.toEqual({ ok: true, value: null })
    const { url, options } = requestAt()
    expect(options?.method).toBe('DELETE')
    expect(url.searchParams.get('phase')).toBe('eq.after')
    expect(url.searchParams.get('no_trades')).toBe('eq.true')
  })
})
