import { describe, expect, it, vi } from "vitest";
import { prepareTradingViewReplayImport } from "@/lib/server/tradingview-replay-import";

vi.mock("server-only", () => ({}));

const sessionId = "a8608020-aca1-4afb-b313-a83de5fd9902";
const fileName = "Handel_im_Wiedergabemodus_OANDA_XAGUSD_2026-11-16_80ed3.xlsx";
const header = ["Trade-Nummer", "Typ", "Datum und Uhrzeit", "Preis USD", "Größe (Menge)", "Netto G&V USD", "Provision USD"];
const entry = [1, "Short-Einstieg", new Date("2026-11-11T14:15:35Z"), 52.79992, 2000, 1157.76, 0];
const exit = [1, "Short-Ausstieg", new Date("2026-11-11T15:35:45Z"), 52.22104, 2000, 1157.76, 0];
type Input = Parameters<typeof prepareTradingViewReplayImport>[0];

function prepare(overrides: Partial<Input> = {}) {
  return prepareTradingViewReplayImport({
    sessionId, fileName, exportOffset: "+01:00", worksheet: [header, entry, exit], riskDrafts: [],
    ...overrides,
  });
}

function batch(overrides?: Partial<Input>) {
  const result = prepare(overrides);
  if (!result.ok) throw new Error(result.reason);
  return result.batch;
}

describe("server-side Replay import preparation", () => {
  it("reparses the worksheet, assigns simulation, converts both times and retains raw prices and net P&L", () => {
    expect(batch()).toMatchObject({
      sessionId, source: "tradingview_replay", mode: "simulation", market: "OANDA:XAGUSD",
      exportOffset: "+01:00", pnlCurrency: "USD", priceCurrency: "USD",
      sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      submissionDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      trades: [{
        tradeNumber: 1, direction: "short",
        openedAtExport: "2026-11-11T14:15:35", closedAtExport: "2026-11-11T15:35:45",
        openedAt: "2026-11-11T13:15:35.000Z", closedAt: "2026-11-11T14:35:45.000Z",
        entry: 52.79992, exit: 52.22104, quantity: 2000, netPnL: 1157.76, commission: 0,
        stopLoss: null, takeProfit: null,
      }],
    });
  });

  it("gives reordered and re-exported rows identical digests despite a changed filename suffix", () => {
    const original = batch();
    const reordered = batch({
      worksheet: [header, exit, entry],
      fileName: "Handel_im_Wiedergabemodus_OANDA_XAGUSD_2026-11-17_ae286.xlsx",
      sessionId: sessionId.toUpperCase(),
    });
    expect(reordered).toEqual(original);
  });

  it("retains distinct trade numbers with identical economics in one export", () => {
    const second = (row: unknown[]) => [2, ...row.slice(1)];
    const result = batch({ worksheet: [header, second(exit), entry, second(entry), exit] });
    expect(result.trades.map((trade) => trade.tradeNumber)).toEqual([1, 2]);
    expect(result.sourceDigest).not.toBe(batch().sourceDigest);
  });

  it("gives a different session a different submission identity while retaining the source digest", () => {
    const another = batch({ sessionId: "e3176c40-dddf-48a0-b9de-4e909fc06558" });
    expect(another.sourceDigest).toBe(batch().sourceDigest);
    expect(another.submissionDigest).not.toBe(batch().submissionDigest);
  });

  it("changes the source digest when a reported economic field changes", () => {
    const changedExit = [...exit];
    changedExit[5] = 0;
    const changed = batch({ worksheet: [header, entry, changedExit] });
    expect(changed.sourceDigest).not.toBe(batch().sourceDigest);
    expect(changed.trades[0].netPnL).toBe(0);
  });

  it("binds the confirmed offset and optional risk to the submission without changing the source digest", () => {
    const first = batch();
    const offset = batch({ exportOffset: "+00:00" });
    const risk = batch({ riskDrafts: [{ tradeNumber: 1, stopLoss: "52,857808", takeProfit: "52.22104" }] });
    expect(offset.trades[0].openedAt).toBe("2026-11-11T14:15:35.000Z");
    expect(risk.trades[0]).toMatchObject({ stopLoss: 52.857808, takeProfit: 52.22104 });
    expect(offset.sourceDigest).toBe(first.sourceDigest);
    expect(risk.sourceDigest).toBe(first.sourceDigest);
    expect(new Set([first.submissionDigest, offset.submissionDigest, risk.submissionDigest]).size).toBe(3);
    expect(batch({ riskDrafts: [{ tradeNumber: 1, stopLoss: "52.857808", takeProfit: "52,22104" }] }).submissionDigest)
      .toBe(risk.submissionDigest);
  });

  it("keeps the price currency distinct from the P&L currency and preserves rebates", () => {
    const alternateHeader = header.map((label) => label === "Preis USD" ? "Preis EUR" : label);
    const rebatedExit = [...exit];
    rebatedExit[6] = -0.25;
    expect(batch({ worksheet: [alternateHeader, entry, rebatedExit] })).toMatchObject({
      priceCurrency: "EUR", pnlCurrency: "USD", trades: [{ commission: -0.25 }],
    });
  });

  it.each([
    { sessionId: "bad-id" },
    { sessionId: "e3176c40-dddf-38a0-b9de-4e909fc06558" },
  ])("rejects a malformed Replay session", (overrides) => {
    expect(prepare(overrides)).toEqual({ ok: false, reason: "invalid-session" });
  });

  it("rejects a renamed generic file and a malformed worksheet", () => {
    expect(prepare({ fileName: "trades.xlsx" })).toEqual({ ok: false, reason: "invalid-filename" });
    expect(prepare({ worksheet: [["Summary"], [145]] })).toEqual({ ok: false, reason: "invalid-worksheet" });
  });

  it.each([[header, entry], [header, entry, exit, exit], [header, entry, exit, ["unassigned"]]])(
    "stops the whole import on incomplete or ambiguous rows", (...worksheet) => {
      expect(prepare({ worksheet })).toEqual({ ok: false, reason: "incomplete-worksheet" });
    },
  );

  it("rejects P&L currencies unsupported by the journal", () => {
    const jpyHeader = header.map((label) => label.replace("Netto G&V USD", "Netto G&V JPY").replace("Provision USD", "Provision JPY"));
    expect(prepare({ worksheet: [jpyHeader, entry, exit] })).toEqual({ ok: false, reason: "unsupported-pnl-currency" });
  });

  it.each([["", "missing-offset"], ["+14:01", "invalid-offset"]])("rejects unconfirmed UTC offset %s", (exportOffset, reason) => {
    expect(prepare({ exportOffset })).toEqual({ ok: false, reason });
  });

  it("rejects risk fields for an unknown trade number or a price on the wrong side", () => {
    expect(prepare({ riskDrafts: [{ tradeNumber: 2, stopLoss: "53", takeProfit: "" }] }))
      .toEqual({ ok: false, reason: "invalid-risk" });
    expect(prepare({ riskDrafts: [{ tradeNumber: 1, stopLoss: "52", takeProfit: "" }] }))
      .toEqual({ ok: false, reason: "invalid-risk", tradeNumber: 1 });
  });
});
