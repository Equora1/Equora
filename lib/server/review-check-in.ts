import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { isCalendarDateKey } from '@/lib/utils/calendar'
import { REVIEW_PERIOD_OPTIONS, type ReviewPeriodPreset, type ReviewSnapshot } from '@/lib/utils/review-types'
import { getTradeDateKey } from '@/lib/utils/trade-time'

type ReviewCheckInSummary = {
  ratedDays: number
  reportedNoTradeDays: number
  averageAdherence: number | null
}

export type ReviewCheckInSummaries = Record<ReviewPeriodPreset, ReviewCheckInSummary>

type CheckInReviewRow = {
  trade_date: string
  plan_adherence: number | null
  no_trades: boolean
}

export async function getReviewCheckInSummaries(
  ownerId: string,
  snapshots: Record<ReviewPeriodPreset, Pick<ReviewSnapshot, 'periodStart' | 'periodEnd'>>,
): Promise<ReviewCheckInSummaries | null> {
  try {
    // Use the same inclusive Berlin calendar days as the selected trade review.
    const windows = REVIEW_PERIOD_OPTIONS.map(({ key }) => ({
      key,
      from: getTradeDateKey(snapshots[key].periodStart) ?? '',
      to: getTradeDateKey(snapshots[key].periodEnd) ?? '',
    }))
    const widest = windows.find(({ key }) => key === '90d')
    if (!widest || !windows.every(({ from, to }) => isCalendarDateKey(from) && isCalendarDateKey(to)
      && from <= to && from >= widest.from && to <= widest.to)) return null

    const supabase = await createSupabaseAuthServerClient()
    const { data, count, error } = await supabase.from('trading_check_ins')
      .select('trade_date,plan_adherence,no_trades', { count: 'exact' })
      .eq('user_id', ownerId)
      .eq('phase', 'after')
      .gte('trade_date', widest.from)
      .lte('trade_date', widest.to)
      .limit(90)
    if (error || !data || count !== data.length) return null

    const dates = new Set<string>()
    for (const { trade_date, plan_adherence, no_trades } of data) {
      if (!isCalendarDateKey(trade_date) || trade_date < widest.from || trade_date > widest.to || dates.has(trade_date)
        || typeof no_trades !== 'boolean'
        || (plan_adherence !== null && (no_trades || !Number.isInteger(plan_adherence) || plan_adherence < 1 || plan_adherence > 5))) {
        return null
      }
      dates.add(trade_date)
    }

    const rows: CheckInReviewRow[] = data
    const summaries = {} as ReviewCheckInSummaries
    for (const { key, from, to } of windows) {
      let ratedDays = 0
      let reportedNoTradeDays = 0
      let total = 0
      for (const row of rows) {
        if (row.trade_date < from || row.trade_date > to) continue
        if (row.no_trades) reportedNoTradeDays++
        if (row.plan_adherence === null) continue
        ratedDays++
        total += row.plan_adherence
      }
      summaries[key] = {
        ratedDays,
        reportedNoTradeDays,
        averageAdherence: ratedDays ? total / ratedDays : null,
      }
    }
    return summaries
  } catch {
    // A check-in read failure must not hide the trade review.
    return null
  }
}
