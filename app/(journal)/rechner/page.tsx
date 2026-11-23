import { TradingCalculators } from '@/components/trades/trading-calculators'
import { requireUser } from '@/lib/server/auth'

export default async function CalculatorsPage() {
  await requireUser()
  return <TradingCalculators />
}
