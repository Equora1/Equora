import { loginWithPassword, signupWithPassword } from '@/app/actions/auth'

export function AuthPanel({ nextPath, error, success }: { nextPath?: string; error?: string; success?: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={loginWithPassword} className="eq-card rounded-[1.1rem] p-6">
        <input type="hidden" name="next" value={nextPath || '/dashboard'} />
        <p className="text-xs uppercase tracking-[0.25em] text-[#998a72]">Equora Login</p>
        <h2 className="eq-display eq-text-gradient mt-3 text-[1.85rem] leading-none">Einloggen</h2>
        <p className="mt-3 text-sm leading-6 text-[#998a72]">Öffnet dein persönliches Journal, deine Trades und deine Analytics.</p>
        <div className="mt-6 space-y-4">
          <input type="email" name="email" placeholder="E-Mail" className="w-full rounded-xl border px-4 py-3 text-sm text-white outline-none placeholder:text-[#998a72]" />
          <input type="password" name="password" placeholder="Passwort" className="w-full rounded-xl border px-4 py-3 text-sm text-white outline-none placeholder:text-[#998a72]" />
        </div>
        <button type="submit" className="eq-button-primary mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold hover:opacity-95">Login starten</button>
      </form>

      <form action={signupWithPassword} className="eq-card rounded-[1.1rem] p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-[#998a72]">Neues Konto</p>
        <h2 className="eq-display eq-text-gradient mt-3 text-[1.85rem] leading-none">Registrieren</h2>
        <p className="mt-3 text-sm leading-6 text-[#998a72]">Legt deinen privaten Arbeitsbereich an. RLS koppelt die Daten dann an dein Konto.</p>
        <div className="mt-6 space-y-4">
          <input type="email" name="email" placeholder="E-Mail" className="w-full rounded-xl border px-4 py-3 text-sm text-white outline-none placeholder:text-[#998a72]" />
          <input type="password" name="password" placeholder="Passwort" className="w-full rounded-xl border px-4 py-3 text-sm text-white outline-none placeholder:text-[#998a72]" />
        </div>
        <button type="submit" className="eq-button-secondary mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold hover:opacity-95">Konto erstellen</button>
      </form>

      {error ? <div className="rounded-xl border border-[#e5484d]/25 bg-[#e5484d]/10 px-4 py-3 text-sm text-red-100 lg:col-span-2">{error}</div> : null}
      {success ? <div className="rounded-xl border border-[#c8823a]/25 bg-[#c8823a]/10 px-4 py-3 text-sm text-[#f0a855] lg:col-span-2">{success}</div> : null}
    </div>
  )
}
