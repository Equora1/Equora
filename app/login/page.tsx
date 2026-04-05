import { redirect } from 'next/navigation'
import { AuthPanel } from '@/components/auth/auth-panel'
import { getCurrentUser } from '@/lib/server/auth'
import { hasSupabaseClientEnv } from '@/lib/supabase/config'



export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ error?: string; success?: string; next?: string; logged_out?: string }> }) {
  const params = (await searchParams) ?? {}
  const user = await getCurrentUser()
  const logoutBounce = params.logged_out === '1'

  if (user && !logoutBounce) redirect('/dashboard')

  const intro = hasSupabaseClientEnv()
    ? 'Nach dem Login nutzt Equora dein eigenes Konto für Trades, Tags und Kalender.'
    : 'Supabase ist lokal noch nicht konfiguriert. Bis die Env-Werte stehen, bleibt der Demo-Pfad aktiv.'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080808] px-6 py-10 text-white">
      <div className="w-full max-w-5xl space-y-6">
        <div className="rounded-[28px] border border-[#221e1a] bg-[#0d0d0d]/95 p-8 shadow-[0_24px_72px_rgba(0,0,0,0.48)] xl:p-9">
          <p className="eq-display text-[0.68rem] text-[#b09a7a]">Equora</p>
          <h1 className="eq-display eq-text-gradient mt-4 text-[2.65rem] leading-none">Equora Login</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#998a72]">{intro}</p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <AuthPanel nextPath={params.next} error={params.error} success={params.success} />

          <div className="rounded-[28px] border border-[#221e1a] bg-[#0d0d0d]/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.42)] xl:p-7">
            <p className="text-xs uppercase tracking-[0.24em] text-[#998a72]">Erster Nutzerpfad</p>
            <h2 className="mt-4 text-2xl font-semibold text-white">In drei Schritten zum ersten belastbaren Review</h2>
            <div className="mt-5 space-y-3">
              {[
                '1 bis 2 Setup-Namen festlegen',
                'Ersten Trade per Schnellerfassung sichern',
                'Einen Trade vervollständigen',
              ].map((item, index) => (
                <div key={item} className="rounded-2xl border border-[#221e1a] bg-[#1f1c1a]/45 px-4 py-3.5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#998a72]">{index + 1}</p>
                  <p className="mt-2 text-sm text-white/82">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
