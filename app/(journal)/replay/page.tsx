import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { journalNumberLocale, journalText } from "@/lib/i18n/journal";
import { getCurrentUser } from "@/lib/server/auth";
import { getJournalLocale } from "@/lib/server/journal-locale";
import { readReplaySessionOptions, replayStorageEnabled } from "@/lib/server/tradingview-replay-storage";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server-auth";
import { isReplaySessionId } from "@/lib/utils/tradingview-replay-worksheet";

type ReplayEntry = {
  trade_number: number; direction: "long" | "short";
  opened_at: string; closed_at: string;
  entry: number; exit: number; quantity: number; net_pnl: number;
  stop_loss: number | null; take_profit: number | null;
};
type ReplayDetails = { market: string; price_currency: string; pnl_currency: string; export_offset: string };
const PAGE_SIZE = 50;

export default async function ReplayJournalPage({ searchParams }: {
  searchParams?: Promise<{ session?: string | string[]; page?: string | string[] }>;
}) {
  if (!replayStorageEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [locale, params, sessions] = await Promise.all([getJournalLocale(), searchParams, readReplaySessionOptions(user.id)]);
  const text = journalText(locale);
  const sessionId = isReplaySessionId(params?.session) ? params.session : null;
  const page = typeof params?.page === "string" && /^(?:[1-9]|[1-4]\d|50)$/.test(params.page) ? Number(params.page) : 1;
  const client = sessionId ? await createSupabaseAuthServerClient() : null;
  const selected = sessionId && client ? await client.from("journal_replay_sessions")
    .select("id,label").eq("user_id", user.id).eq("id", sessionId)
    .returns<{ id: string; label: string }[]>().maybeSingle() : null;
  const [details, trades] = selected?.data && client && sessionId ? await Promise.all([
    client.from("journal_replay_imports").select("market,price_currency,pnl_currency,export_offset")
      .eq("user_id", user.id).eq("session_id", sessionId).returns<ReplayDetails[]>().maybeSingle(),
    client.from("journal_replay_trades").select("trade_number,direction,opened_at,closed_at,entry,exit,quantity,net_pnl,stop_loss,take_profit", { count: "exact" })
      .eq("user_id", user.id).eq("session_id", sessionId).order("trade_number")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1).returns<ReplayEntry[]>(),
  ]) : [null, null];
  const failed = !sessions || selected?.error || details?.error || trades?.error;
  const replay = details?.data;
  const number = new Intl.NumberFormat(journalNumberLocale[locale], { maximumFractionDigits: 8 });
  const utcDate = (value: string) => `${new Date(value).toISOString().slice(0, 19).replace("T", " ")} UTC`;
  const linkClass = "rounded-lg border border-white/15 px-3 py-2 text-sm";

  return (
    <section lang={locale} className="space-y-5 rounded-3xl border border-white/10 bg-black/20 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{text("Replay-Journal", "Replay journal")}</h1>
          <p className="mt-1 text-sm text-white/65">{text("Deine simulierten TradingView-Positionen", "Your simulated TradingView positions")}</p>
        </div>
        <Link href="/trades?capture=import#trade-editor" className={linkClass}>{text("Replay-Datei prüfen", "Preview Replay file")}</Link>
      </header>
      {failed ? <p role="alert">{text("Replay-Daten konnten nicht geladen werden.", "Replay data could not be loaded.")}</p> : (
        <>
          {sessions?.length ? <nav aria-label={text("Neueste Replay-Sitzungen", "Latest Replay sessions")} className="flex flex-wrap gap-2">
            {sessions.map((session) => (
              <Link href={`/replay?session=${session.id}`} key={session.id} aria-current={session.id === sessionId ? "page" : undefined}
                className={`${linkClass} ${session.id === sessionId ? "bg-white/10" : ""}`}>{session.label}</Link>
            ))}
          </nav> : <p>{text("Noch keine Replay-Sitzungen vorhanden.", "No Replay sessions yet.")}</p>}
          {sessionId && !selected?.data ? <p role="status">{text("Diese Sitzung ist nicht verfügbar.", "This session is unavailable.")}</p> : null}
          {selected?.data ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">{selected.data.label}</h2>
              {replay && trades ? (
                <>
                  <p className="text-sm text-white/65">{replay.market} · {text("Simulation", "Simulation")} · UTC{replay.export_offset}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-left text-sm">
                      <thead><tr>
                        {[text("Position", "Position"), text("Einstieg", "Entry"), text("Ausstieg", "Exit"), text("Menge", "Quantity"), text("Nettoergebnis", "Net P&L"), text("Stop / Ziel", "Stop / target")].map((label) => (
                          <th key={label} scope="col" className="px-2 py-2 text-white/65">{label}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {trades.data?.map((trade) => (
                          <tr key={trade.trade_number} className="border-t border-white/10">
                            <td className="px-2 py-2">{trade.trade_number} · {trade.direction === "long" ? "Long" : "Short"}</td>
                            <td className="px-2 py-2">{number.format(trade.entry)} {replay.price_currency}<br />{utcDate(trade.opened_at)}</td>
                            <td className="px-2 py-2">{number.format(trade.exit)} {replay.price_currency}<br />{utcDate(trade.closed_at)}</td>
                            <td className="px-2 py-2">{number.format(trade.quantity)}</td>
                            <td className="px-2 py-2">{number.format(trade.net_pnl)} {replay.pnl_currency}</td>
                            <td className="px-2 py-2">
                              {trade.stop_loss === null ? "—" : number.format(trade.stop_loss)}
                              {" / "}
                              {trade.take_profit === null ? "—" : number.format(trade.take_profit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <nav className="flex gap-2" aria-label={text("Replay-Positionen blättern", "Replay position pages")}>
                    {page > 1 ? <Link className={linkClass} href={`/replay?session=${sessionId}&page=${page - 1}`}>{text("Zurück", "Previous")}</Link> : null}
                    {(trades.count ?? 0) > page * PAGE_SIZE ? <Link className={linkClass} href={`/replay?session=${sessionId}&page=${page + 1}`}>{text("Weiter", "Next")}</Link> : null}
                  </nav>
                </>
              ) : <p className="text-sm text-white/65">{text("Für diese Sitzung wurde noch kein Export gespeichert.", "This session has no saved export yet.")}</p>}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
