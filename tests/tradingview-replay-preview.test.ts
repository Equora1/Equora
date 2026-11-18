import { describe, expect, it } from "vitest";
import {
  buildTradingViewReplayPreview,
  getTradingViewReplayMarket,
} from "@/lib/utils/tradingview-replay-preview";

const market = "OANDA:XAGUSD";
const header = ["Trade-Nummer", "Typ", "Datum und Uhrzeit", "Signal", "Preis USD", "Größe (Menge)", "Netto G&V USD", "Provision USD"];
const start = new Date("2026-01-05T14:00:15.000Z");
const end = new Date("2026-01-05T14:25:00.000Z");
const entry = [1, "Short-Einstieg", start, "Sell limit order", 50.25, 20, 3, 0];
const exit = [1, "Short-Ausstieg", end, "Bracket Take Profit", 50.1, 20, 3, 0];
type ReplaySheet = Parameters<typeof buildTradingViewReplayPreview>[1];
const preview = (...rows: ReplaySheet) => buildTradingViewReplayPreview(market, [header, ...rows]);

describe("TradingView Replay worksheet preview", () => {
  it("gets the market from the original German Replay filename", () => {
    expect(getTradingViewReplayMarket("Handel_im_Wiedergabemodus_OANDA_XAGUSD_2026-11-16_80ed3.xlsx")).toBe(market);
    expect(getTradingViewReplayMarket("Handel_im_Wiedergabemodus_CME_MINI_MNQ1!_2026-01-05_ab123.xlsx")).toBe("CME_MINI:MNQ1!");
    expect(getTradingViewReplayMarket("OANDA_XAGUSD.xlsx")).toBeNull();
  });

  it("pairs an exit first and counts the repeated net P&L once", () => {
    expect(preview(exit, entry)).toEqual({
      ok: true, market, priceCurrency: "USD", pnlCurrency: "USD",
      trades: [{
        number: 1, direction: "short", openedAt: "2026-01-05T14:00:15", closedAt: "2026-01-05T14:25:00",
        entry: 50.25, exit: 50.1, quantity: 20, netPnL: 3, commission: 0,
      }],
      unpairedTradeCount: 0, unassignedRowCount: 0,
    });
  });

  it("pairs different trade numbers independently and preserves zero and negative results", () => {
    const result = preview(exit, [2, "Long-Einstieg", start, "", 50, 20, null, null], entry, [2, "Long-Ausstieg", end, "", 50, 20, 0, null],
      [3, "Long-Ausstieg", end, "", 49.9, 20, -2, 0], [3, "Long-Einstieg", start, "", 50, 20, -2, 0]);
    expect(result.ok && result.trades.map(({ netPnL, commission }) => [netPnL, commission])).toEqual([[3, 0], [0, null], [-2, 0]]);
  });

  it.each([
    [entry],
    [entry, exit, exit],
    [entry, [1, "Long-Ausstieg", end, "", 50.1, 20, 3, 0]],
    [entry, [1, "Short-Ausstieg", end, "", 50.1, 10, 3, 0]],
    [entry, [1, "Short-Ausstieg", end, "", 50.1, 20, null, 0]],
    [entry, [1, "Short-Ausstieg", new Date("2026-01-05T13:00:00Z"), "", 50.1, 20, 3, 0]],
  ] satisfies ReplaySheet[])("flags incomplete or ambiguous positions %#", (...rows) => {
    expect(preview(...rows)).toMatchObject({ ok: true, trades: [], unpairedTradeCount: 1 });
  });

  it("ignores blank rows and reports rows missing a valid trade number", () => {
    expect(preview([null], ["invalid", "Short-Ausstieg"], exit, entry)).toMatchObject({
      ok: true, trades: [{ number: 1 }], unpairedTradeCount: 0, unassignedRowCount: 1,
    });
  });

  it("keeps price currency distinct from reported P&L currency", () => {
    const different = header.map((cell) => cell === "Preis USD" ? "Preis EUR" : cell);
    expect(buildTradingViewReplayPreview(market, [different, entry, exit])).toMatchObject({
      ok: true, priceCurrency: "EUR", pnlCurrency: "USD",
    });
  });

  it("rejects a summary sheet, a mismatched currency header and duplicate required headers", () => {
    expect(buildTradingViewReplayPreview(market, [["", "Alle USD"], ["Nettogewinn", 3]])).toEqual({ ok: false, reason: "header" });
    expect(buildTradingViewReplayPreview(market, [header.map((cell) => cell === "Provision USD" ? "Provision EUR" : cell), entry, exit])).toEqual({ ok: false, reason: "header" });
    expect(buildTradingViewReplayPreview(market, [[...header, "Trade-Nummer"], entry, exit])).toEqual({ ok: false, reason: "header" });
  });
});
