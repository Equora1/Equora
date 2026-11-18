import { describe, expect, it } from "vitest";
import { resolveTradingViewReplayExportTimes } from "@/lib/utils/tradingview-replay-time";

const silver = { number: 1, openedAt: "2026-11-11T14:15:07", closedAt: "2026-11-11T15:35:02" };

describe("TradingView Replay export times", () => {
  it("requires an explicitly supplied offset", () => {
    expect(resolveTradingViewReplayExportTimes([silver], " ")).toEqual({ ok: false, reason: "missing-offset" });
  });

  it("preserves seconds and applies a known positive offset", () => {
    expect(resolveTradingViewReplayExportTimes([silver], " +01:00 ")).toEqual({
      ok: true, offset: "+01:00",
      times: [{ openedAt: "2026-11-11T13:15:07.000Z", closedAt: "2026-11-11T14:35:02.000Z" }],
    });
  });

  it("handles a fractional offset across a calendar boundary", () => {
    expect(resolveTradingViewReplayExportTimes([
      { number: 3, openedAt: "2026-01-01T00:04:53", closedAt: "2026-01-01T00:04:54" },
      silver,
    ], "+05:30")).toEqual({
      ok: true, offset: "+05:30",
      times: [
        { openedAt: "2025-12-31T18:34:53.000Z", closedAt: "2025-12-31T18:34:54.000Z" },
        { openedAt: "2026-11-11T08:45:07.000Z", closedAt: "2026-11-11T10:05:02.000Z" },
      ],
    });
  });

  it.each(["-05:00", "−05:00"])("supports negative offsets typed as %s", (offset) => {
    expect(resolveTradingViewReplayExportTimes([silver], offset)).toEqual({
      ok: true, offset: "-05:00",
      times: [{ openedAt: "2026-11-11T19:15:07.000Z", closedAt: "2026-11-11T20:35:02.000Z" }],
    });
  });

  it("supports explicitly selected UTC and either extreme of the offset range", () => {
    for (const [offset, openedAt] of [
      ["+00:00", "2026-11-11T14:15:07.000Z"],
      ["+14:00", "2026-11-11T00:15:07.000Z"],
      ["-14:00", "2026-11-12T04:15:07.000Z"],
    ]) {
      expect(resolveTradingViewReplayExportTimes([silver], offset)).toMatchObject({ ok: true, times: [{ openedAt }] });
    }
  });

  it.each(["+1:00", "Z", "Europe/Berlin", "-00:00", "+07:60", "+14:01", "-15:00"])(
    "rejects ambiguous or invalid offset %s", (offset) => {
      expect(resolveTradingViewReplayExportTimes([silver], offset)).toEqual({ ok: false, reason: "invalid-offset" });
    },
  );

  it.each([
    "2026-11-10T15:35:02",
    "2026-11-31T15:35:02",
    "2026-11-11T24:00:00",
    "2026-11-11T15:35:60",
    "2026-11-11T15:35:02Z",
    "2026-11-11T15:35",
  ])("does not return a partial UTC preview when a trade has time %s", (closedAt) => {
    expect(resolveTradingViewReplayExportTimes([silver, { ...silver, number: 2, closedAt }], "+00:00"))
      .toEqual({ ok: false, reason: "invalid-trade-time", tradeNumber: 2 });
  });

  it("rejects a date that shifts outside the supported UTC calendar", () => {
    expect(resolveTradingViewReplayExportTimes([
      { number: 5, openedAt: "9999-12-31T23:59:59", closedAt: "9999-12-31T23:59:59" },
    ], "-02:00")).toEqual({ ok: false, reason: "invalid-trade-time", tradeNumber: 5 });
  });
});
