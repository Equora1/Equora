"use client";

import { useJournalLocale } from "@/components/layout/journal-locale-provider";
import { journalNumberLocale, journalText } from "@/lib/i18n/journal";
import type { TradingViewReplayPreview } from "@/lib/utils/tradingview-replay-preview";

export function TradingViewReplayFilePreview({ report, onBack }: {
  report: Extract<TradingViewReplayPreview, { ok: true }>;
  onBack: () => void;
}) {
  const locale = useJournalLocale();
  const text = journalText(locale);
  const formatLocale = journalNumberLocale[locale];
  const number = new Intl.NumberFormat(formatLocale, { maximumFractionDigits: 8 });
  const money = new Intl.NumberFormat(formatLocale, { style: "currency", currency: report.pnlCurrency, currencyDisplay: "code" });
  const skipped = report.unpairedTradeCount + report.unassignedRowCount;
  const date = (value: string) => value.replace("T", " ").replace(/:00$/, "");

  return (
    <section aria-labelledby="tradingview-replay-preview" className="space-y-4 rounded-[28px] border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tradingview-replay-preview" className="text-xl font-semibold text-white">{text("TradingView Replay – Vorschau", "TradingView Replay preview")}</h2>
          <p className="mt-1 text-sm text-white/70">{report.market} · {text("Simulation", "Simulation")}</p>
        </div>
        <button type="button" onClick={onBack} className="rounded-xl border border-white/20 px-3 py-2 text-sm text-white">
          {text("Andere Datei wählen", "Choose another file")}
        </button>
      </div>
      <p className="text-sm text-white/70">
        {text(`${report.trades.length} abgeschlossene ${report.trades.length === 1 ? "Position" : "Positionen"} erkannt. Zeiten wie im Export. Die Datei nennt keine Zeitzone.`,
          `${report.trades.length} closed ${report.trades.length === 1 ? "position" : "positions"} found. Times are shown as exported. The file does not specify a timezone.`)}
      </p>
      {skipped ? (
        <p role="status" className="text-sm text-orange-100">
          {text(`${report.unpairedTradeCount} Trades ohne eindeutiges Paar und ${report.unassignedRowCount} Zeilen ohne gültige Trade-Nummer.`,
            `${report.unpairedTradeCount} trades without an unambiguous pair and ${report.unassignedRowCount} rows without a valid trade number.`)}
        </p>
      ) : null}
      {report.trades.length ? (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="text-white/65">
              <tr>
                <th scope="col" className="px-2 py-2">{text("Trade", "Trade")}</th>
                <th scope="col" className="px-2 py-2">{text("Einstieg", "Entry")}</th>
                <th scope="col" className="px-2 py-2">{text("Ausstieg", "Exit")}</th>
                <th scope="col" className="px-2 py-2 text-right">{text("Menge", "Quantity")}</th>
                <th scope="col" className="px-2 py-2 text-right">{text("Nettoergebnis", "Net P&L")}</th>
              </tr>
            </thead>
            <tbody>
              {report.trades.map((trade) => (
                <tr key={trade.number} className="border-t border-white/10">
                  <td className="px-2 py-2">{number.format(trade.number)} · {trade.direction === "long" ? "Long" : "Short"}</td>
                  <td className="px-2 py-2">{number.format(trade.entry)} {report.priceCurrency}<br />{date(trade.openedAt)}</td>
                  <td className="px-2 py-2">{number.format(trade.exit)} {report.priceCurrency}<br />{date(trade.closedAt)}</td>
                  <td className="px-2 py-2 text-right">{number.format(trade.quantity)}</td>
                  <td className="px-2 py-2 text-right">{money.format(trade.netPnL)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {report.trades.length ? (
        <p className="text-sm text-white/65">
          {text("Ohne ursprünglichen Stop-Loss bleiben R und das geplante R:R offen.", "R and planned risk/reward require the initial stop loss.")}
        </p>
      ) : null}
      <p className="text-sm text-white/65">{text("Die Übernahme ins Journal ist noch nicht verfügbar.", "Saving these trades to the journal is not available yet.")}</p>
    </section>
  );
}
