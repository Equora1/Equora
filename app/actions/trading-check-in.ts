'use server'

import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { isCalendarDateKey } from '@/lib/utils/calendar'
import {
  checkInColumns,
  checkInQuestions,
  hasCheckInContent,
  isCheckInPhase,
  parseCheckInDraft,
  readCheckInRow,
  type CheckInDraft,
  type TradingCheckInDay,
} from '@/lib/utils/trading-check-in'

type CheckInFailure = { ok: false; reason: 'invalid' | 'unavailable' | 'signed_out' | 'changed' }
type ReadResult = CheckInFailure | { ok: true; day: TradingCheckInDay }
type SaveResult = CheckInFailure | { ok: true; value: CheckInDraft | null }

const table = 'trading_check_ins'
const selectedColumns = ['phase', ...checkInQuestions, 'no_trades'].join(',')

async function authenticatedCheckInClient() {
  const supabase = await createSupabaseAuthServerClient()
  const { data, error } = await supabase.auth.getUser()
  return !error && data.user ? { supabase, userId: data.user.id } : null
}

export async function loadTradingCheckIn(date: unknown): Promise<ReadResult> {
  if (typeof date !== 'string' || !isCalendarDateKey(date)) return { ok: false, reason: 'invalid' }
  if (!hasSupabaseClientEnv()) return { ok: false, reason: 'unavailable' }

  try {
    const session = await authenticatedCheckInClient()
    if (!session) return { ok: false, reason: 'signed_out' }
    const { data, error } = await session.supabase
      .from(table)
      .select(selectedColumns)
      .eq('user_id', session.userId)
      .eq('trade_date', date)

    if (error || !data) return { ok: false, reason: 'unavailable' }
    const day: TradingCheckInDay = { before: null, after: null }
    for (const row of data as unknown[]) {
      const phase = (row as { phase?: unknown } | null)?.phase
      if (!isCheckInPhase(phase) || day[phase]) return { ok: false, reason: 'unavailable' }
      const draft = readCheckInRow(phase, row)
      if (!draft) return { ok: false, reason: 'unavailable' }
      day[phase] = draft
    }
    return { ok: true, day }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

export async function saveTradingCheckIn(input: unknown): Promise<SaveResult> {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'invalid' }
  const { date, phase, draft: draftInput, previous: previousInput } = input as Record<string, unknown>
  if (typeof date !== 'string' || !isCalendarDateKey(date) || !isCheckInPhase(phase)) {
    return { ok: false, reason: 'invalid' }
  }
  const draft = parseCheckInDraft(phase, draftInput)
  const previous = previousInput === null ? null : parseCheckInDraft(phase, previousInput)
  if (!draft || (previousInput !== null && (!previous || !hasCheckInContent(previous)))) {
    return { ok: false, reason: 'invalid' }
  }
  if (!hasSupabaseClientEnv()) return { ok: false, reason: 'unavailable' }
  const value = hasCheckInContent(draft) ? draft : null

  try {
    const session = await authenticatedCheckInClient()
    if (!session) return { ok: false, reason: 'signed_out' }
    if (!previous && !value) return { ok: true, value: null }

    const { supabase, userId } = session
    if (!previous && value) {
      const { error } = await supabase.from(table).insert({
        user_id: userId,
        trade_date: date,
        phase,
        ...checkInColumns(value),
      })
      if (!error) return { ok: true, value }
      if (error.code !== '23505') return { ok: false, reason: 'unavailable' }
    } else if (previous) {
      const mutation = value ? supabase.from(table).update(checkInColumns(value)) : supabase.from(table).delete()
      const scoped = mutation.eq('user_id', userId).eq('trade_date', date).eq('phase', phase)
      for (const [column, expected] of Object.entries(checkInColumns(previous))) {
        if (expected === null) scoped.is(column, null)
        else scoped.eq(column, expected)
      }
      const { data, error } = await scoped.select('phase').maybeSingle()
      if (error) return { ok: false, reason: 'unavailable' }
      if (data) return { ok: true, value }
    }

    // The previous snapshot no longer matches. An identical completed write is
    // safe to acknowledge when the client retries after losing the response.
    const { data, error } = await supabase.from(table).select(selectedColumns)
      .eq('user_id', userId).eq('trade_date', date).eq('phase', phase).maybeSingle()
    if (error) return { ok: false, reason: 'unavailable' }
    if (!data) return value ? { ok: false, reason: 'changed' } : { ok: true, value: null }
    const current = readCheckInRow(phase, data)
    if (!current) return { ok: false, reason: 'unavailable' }
    if (value && JSON.stringify(checkInColumns(current)) === JSON.stringify(checkInColumns(value))) {
      return { ok: true, value: current }
    }
    return { ok: false, reason: 'changed' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}
