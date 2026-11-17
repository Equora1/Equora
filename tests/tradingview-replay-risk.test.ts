import { describe, expect, it } from "vitest";
import { deriveReplayRisk } from "@/lib/utils/tradingview-replay-risk";

const short = { entry: 100, exit: 88, direction: "short" } as const;
const long = { entry: 100, exit: 106, direction: "long" } as const;

describe("optional TradingView Replay risk details", () => {
  it("keeps both results unavailable without a stop", () => {
    expect(deriveReplayRisk(short, { stopLoss: "", takeProfit: "80" })).toEqual({
      stopIssue: null, targetIssue: null, priceR: null, plannedR: null,
    });
  });

  it("computes separate planned and price-based R for a short", () => {
    expect(deriveReplayRisk(short, { stopLoss: "102", takeProfit: "80" })).toMatchObject({
      plannedR: 10, priceR: 6,
    });
  });

  it("computes planned and price-based R for a long", () => {
    expect(deriveReplayRisk(long, { stopLoss: "98", takeProfit: "120" })).toMatchObject({
      plannedR: 10, priceR: 3,
    });
  });

  it("accepts comma and point decimals and uses the separately entered target", () => {
    const result = deriveReplayRisk({ entry: 52.79992, exit: 52.22104, direction: "short" },
      { stopLoss: "52,857808", takeProfit: "52.22104" });
    expect(result.priceR).toBeCloseTo(10, 8);
    expect(result.plannedR).toBeCloseTo(10, 8);
  });

  it.each([104, 100])("preserves negative and zero price-based R with no target (%s)", (exit) => {
    expect(deriveReplayRisk({ ...short, exit }, { stopLoss: "102", takeProfit: "" })).toMatchObject({
      priceR: (100 - exit) / 2, plannedR: null,
    });
  });

  it("flags an invalid target without removing valid price-based R", () => {
    expect(deriveReplayRisk(short, { stopLoss: "102", takeProfit: "110" })).toEqual({
      stopIssue: null, targetIssue: "side", priceR: 6, plannedR: null,
    });
  });

  it.each(["99", "100"])("flags a stop at the entry or on the wrong side (%s)", (stopLoss) => {
    expect(deriveReplayRisk(short, { stopLoss, takeProfit: "80" })).toMatchObject({
      stopIssue: "side", priceR: null, plannedR: null,
    });
  });

  it.each(["1.000,52", "100.0.1", "1e3", "102 USD"])("rejects ambiguous or non-price syntax in both fields (%s)", (invalid) => {
    expect(deriveReplayRisk(short, { stopLoss: invalid, takeProfit: invalid })).toEqual({
      stopIssue: "format", targetIssue: "format", priceR: null, plannedR: null,
    });
  });

  it("supports negative prices if the initial risk is on the correct side", () => {
    expect(deriveReplayRisk({ entry: -10, exit: -7, direction: "long" },
      { stopLoss: "-12", takeProfit: "0" })).toMatchObject({ priceR: 1.5, plannedR: 5 });
  });
});
