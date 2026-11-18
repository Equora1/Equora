"use client";

import { Fragment, useId, useMemo, useState } from "react";
import { useJournalLocale } from "@/components/layout/journal-locale-provider";
import { journalNumberLocale, journalText } from "@/lib/i18n/journal";
import { formatRMultiple } from "@/lib/utils/calculations";
import type { TradingViewReplayPreview } from "@/lib/utils/tradingview-replay-preview";
import { deriveReplayRisk, type ReplayRiskDraft } from "@/lib/utils/tradingview-replay-risk";
import { resolveTradingViewReplayExportTimes } from "@/lib/utils/tradingview-replay-time";
import { TradingViewReplaySave } from "@/components/trades/tradingview-replay-save";
import { encodeReplayWorksheet } from "@/lib/utils/tradingview-replay-worksheet";

type ReplayReport = Extract<TradingViewReplayPreview, { ok: true }>;
const emptyRiskDraft: ReplayRiskDraft = { stopLoss: "", takeProfit: "" };

function ReplayRiskFields({ id, trade, currency, draft, onChange }: {
  id: string;
  trade: ReplayReport["trades"][number];
  currency: string;
  draft: ReplayRiskDraft;
  onChange: (next: ReplayRiskDraft) => void;
}) {
  const locale = useJournalLocale();
  const text = journalText(locale);
  const number = new Intl.NumberFormat(journalNumberLocale[locale], { maximumFractionDigits: 2 });
  const { stopIssue, targetIssue, priceR, plannedR } = deriveReplayRisk(trade, draft);
  const invalidFormat = text("Gib einen Preis mit Komma oder Punkt ein.", "Enter a price using a comma or a decimal point.");
  const stopError = stopIssue === "format" ? invalidFormat : stopIssue === "side"
    ? trade.direction === "long"
      ? text("Der Stop muss unter dem Einstieg liegen.", "The stop must be below the entry price.")
      : text("Der Stop muss über dem Einstieg liegen.", "The stop must be above the entry price.")
    : null;
  const targetError = targetIssue === "format" ? invalidFormat : targetIssue === "side"
    ? trade.direction === "long"
      ? text("Das Kursziel muss über dem Einstieg liegen.", "The target must be above the entry price.")
      : text("Das Kursziel muss unter dem Einstieg liegen.", "The target must be below the entry price.")
    : null;
  const inputClass = "mt-1 block w-full rounded-lg border border-white/20 bg-black/30 px-2 py-1.5 text-white";

  return (
    <div className="space-y-3 rounded-xl bg-white/5 p-3">
      <p className="text-sm text-white/70">
        {text("Optional für diese Vorschau. Verwende die Werte aus deinem ursprünglichen Trade-Plan.", "Optional for this preview. Use the prices from your original trade plan.")}
      </p>
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <label htmlFor={`${id}-stop`}>{text("Ursprünglicher Stop", "Initial stop loss")} · {currency}</label>
          <input id={`${id}-stop`} type="text" inputMode="decimal" autoComplete="off" value={draft.stopLoss}
            onChange={(event) => onChange({ ...draft, stopLoss: event.target.value })}
            aria-invalid={Boolean(stopError)} aria-describedby={stopError ? `${id}-stop-error` : undefined} className={inputClass} />
          {stopError ? <p id={`${id}-stop-error`} className="mt-1 text-sm text-orange-100">{stopError}</p> : null}
        </div>
        <div className="w-48">
          <label htmlFor={`${id}-target`}>{text("Geplantes Kursziel", "Planned target")} · {currency}</label>
          <input id={`${id}-target`} type="text" inputMode="decimal" autoComplete="off" value={draft.takeProfit}
            onChange={(event) => onChange({ ...draft, takeProfit: event.target.value })}
            aria-invalid={Boolean(targetError)} aria-describedby={targetError ? `${id}-target-error` : undefined} className={inputClass} />
          {targetError ? <p id={`${id}-target-error`} className="mt-1 text-sm text-orange-100">{targetError}</p> : null}
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-live="polite">
        <div>
          <dt className="text-white/65">{text("Geplantes R:R", "Planned risk/reward")}</dt>
          <dd className="font-semibold text-white">{plannedR === null ? "—" : `1:${number.format(plannedR)}`}</dd>
        </div>
        <div>
          <dt className="text-white/65">{text("R aus Kursbewegung (vor Kosten)", "Price-based R (before costs)")}</dt>
          <dd className="font-semibold text-white">{priceR === null ? "—" : formatRMultiple(priceR, 2, locale)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function TradingViewReplayFilePreview({ report, onBack, storage }: {
  report: ReplayReport;
  onBack: () => void;
  storage?: { fileName: string; worksheet: Parameters<typeof encodeReplayWorksheet>[0] };
}) {
  const locale = useJournalLocale();
  const [activeTrade, setActiveTrade] = useState<number | null>(null);
  const [riskDrafts, setRiskDrafts] = useState<Record<number, ReplayRiskDraft>>({});
  const [exportOffset, setExportOffset] = useState("");
  const offsetId = useId();
  const exportTimes = useMemo(
    () => resolveTradingViewReplayExportTimes(report.trades, exportOffset),
    [report.trades, exportOffset],
  );
  const worksheet = storage?.worksheet;
  const worksheetPayload = useMemo(() => worksheet ? encodeReplayWorksheet(worksheet) : null, [worksheet]);
  const text = journalText(locale);
  const formatLocale = journalNumberLocale[locale];
  const number = new Intl.NumberFormat(formatLocale, { maximumFractionDigits: 8 });
  const money = new Intl.NumberFormat(formatLocale, { style: "currency", currency: report.pnlCurrency, currencyDisplay: "code" });
  const skipped = report.unpairedTradeCount + report.unassignedRowCount;
  const date = (value: string) => value.replace("T", " ").replace(/:00$/, "");
  const utcDate = (value: string) => `${date(value.slice(0, 19))} UTC`;
  const invalidOffset = !exportTimes.ok && exportTimes.reason === "invalid-offset";

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
      {report.trades.length ? (
        <div className="space-y-1.5">
          <label htmlFor={offsetId} className="block text-sm font-medium text-white">
            {text("UTC-Offset des Exports", "Export UTC offset")}
          </label>
          <input
            id={offsetId}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={exportOffset}
            placeholder="+01:00"
            onChange={(event) => setExportOffset(event.target.value)}
            aria-invalid={invalidOffset}
            aria-describedby={`${offsetId}-help${invalidOffset ? ` ${offsetId}-error` : ""}`}
            className="w-32 rounded-lg border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-white"
          />
          <p id={`${offsetId}-help`} className="text-sm text-white/65">
            {text(
              "Wenn du den Offset kennst, gib ihn zur Kontrolle ein. Er muss für alle Zeiten in dieser Datei gelten.",
              "If you know the offset, enter it to check the times. It must apply to every timestamp in this file.",
            )}
          </p>
          {invalidOffset ? (
            <p id={`${offsetId}-error`} className="text-sm text-orange-100">
              {text("Gib einen Offset wie +01:00, −05:00 oder +00:00 für UTC ein.", "Enter an offset such as +01:00, −05:00 or +00:00 for UTC.")}
            </p>
          ) : null}
          {!exportTimes.ok && exportTimes.reason === "invalid-trade-time" ? (
            <p role="status" className="text-sm text-orange-100">
              {text(`Die Zeiten für Trade ${exportTimes.tradeNumber} sind ungültig.`, `Trade ${exportTimes.tradeNumber} has invalid timestamps.`)}
            </p>
          ) : null}
        </div>
      ) : null}
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
                <th scope="col" className="px-2 py-2"><span className="sr-only">{text("Risikoangaben", "Risk details")}</span></th>
              </tr>
            </thead>
            <tbody>
              {report.trades.map((trade, index) => {
                const isOpen = activeTrade === trade.number;
                const riskId = `replay-risk-${trade.number}`;
                const times = exportTimes.ok ? exportTimes.times[index] : undefined;
                return (
                  <Fragment key={trade.number}>
                    <tr className="border-t border-white/10">
                      <td className="px-2 py-2">{number.format(trade.number)} · {trade.direction === "long" ? "Long" : "Short"}</td>
                      <td className="px-2 py-2">
                        {number.format(trade.entry)} {report.priceCurrency}<br />{date(trade.openedAt)}
                        {times ? <span className="block text-white/65">{utcDate(times.openedAt)}</span> : null}
                      </td>
                      <td className="px-2 py-2">
                        {number.format(trade.exit)} {report.priceCurrency}<br />{date(trade.closedAt)}
                        {times ? <span className="block text-white/65">{utcDate(times.closedAt)}</span> : null}
                      </td>
                      <td className="px-2 py-2 text-right">{number.format(trade.quantity)}</td>
                      <td className="px-2 py-2 text-right">{money.format(trade.netPnL)}</td>
                      <td className="px-2 py-2">
                        <button type="button" className="rounded-lg border border-white/20 px-2 py-1 text-white"
                          aria-expanded={isOpen} aria-controls={isOpen ? riskId : undefined}
                          aria-label={text(`Stop & Ziel für Trade ${trade.number}`, `Stop & target for trade ${trade.number}`)}
                          onClick={() => setActiveTrade(isOpen ? null : trade.number)}>
                          {text("Stop & Ziel", "Stop & target")}
                        </button>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr id={riskId}>
                        <td colSpan={6} className="whitespace-normal px-2 pb-3">
                          <ReplayRiskFields id={riskId} trade={trade} currency={report.priceCurrency} draft={riskDrafts[trade.number] ?? emptyRiskDraft}
                            onChange={(draft) => setRiskDrafts((previous) => ({ ...previous, [trade.number]: draft }))} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {report.trades.length ? (
        <p className="text-sm text-white/65">
          {text("R und geplantes R:R lassen sich unter „Stop & Ziel“ ergänzen.", "Use “Stop & target” to calculate price-based R and planned risk/reward.")}
        </p>
      ) : null}
      {storage && report.trades.length && !skipped ? (
        worksheetPayload ? (
          <TradingViewReplaySave
            fileName={storage.fileName}
            worksheetPayload={worksheetPayload}
            exportOffset={exportTimes.ok ? exportTimes.offset : null}
            riskDrafts={riskDrafts}
          />
        ) : <p role="status" className="text-sm text-orange-100">
          {text("Die Datei kann wegen ihrer Größe oder ihres Formats nicht gespeichert werden. Prüfe den Export oder wähle eine kürzere Sitzung.", "The file cannot be saved because of its size or format. Check the export or choose a shorter session.")}
        </p>
      ) : <p className="text-sm text-white/65">{storage
        ? text("Zum Speichern braucht die Datei vollständig erkannte Positionen.", "Saving requires a file with fully recognized positions.")
        : text("Die Übernahme ins Journal ist noch nicht verfügbar.", "Saving these trades to the journal is not available yet.")}</p>}
    </section>
  );
}
