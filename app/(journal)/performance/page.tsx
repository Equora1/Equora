import { notFound } from 'next/navigation'
import { PerformanceDashboard } from '@/components/performance/performance-dashboard'
import { getJournalAccess } from '@/lib/server/auth'
import { isEquoraAdminUser } from '@/lib/server/admin'
import { isPerformanceDiagnosticsEnabled } from '@/lib/server/performance-diagnostics'

export const dynamic = 'force-dynamic'

export default async function PerformancePage() {
  if (!isPerformanceDiagnosticsEnabled()) notFound()

  const access = await getJournalAccess()
  if (access.mode === 'supabase' && !(await isEquoraAdminUser(access.user))) notFound()

  return <PerformanceDashboard />
}
