import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTradingViewReplaySession, getTradingViewReplayOptions, saveTradingViewReplay } from "@/app/actions/tradingview-replay";
import { decodeReplayWorksheet, encodeReplayWorksheet } from "@/lib/utils/tradingview-replay-worksheet";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(), user: vi.fn(), sessions: vi.fn(), rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/tradingview-replay-storage", () => ({
  replayStorageEnabled: mocks.enabled, readReplaySessionOptions: mocks.sessions,
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => ({ rpc: mocks.rpc }) }));

const ownerId = "e3176c40-dddf-48a0-b9de-4e909fc06558";
const sessionId = "a8608020-aca1-4afb-b313-a83de5fd9902";
const header = ["Trade-Nummer", "Typ", "Datum und Uhrzeit", "Preis USD", "Größe (Menge)", "Netto G&V USD", "Provision USD"];
const worksheet = [
  header,
  [1, "Short-Einstieg", new Date("2026-11-11T14:15:00Z"), 52.79992, 2000, 1157.76, 0],
  [1, "Short-Ausstieg", new Date("2026-11-11T15:35:00Z"), 52.22104, 2000, 1157.76, 0],
];
const input = {
  sessionId, fileName: "Handel_im_Wiedergabemodus_OANDA_XAGUSD_2026-11-16_80ed3.xlsx",
  worksheetPayload: encodeReplayWorksheet(worksheet)!, exportOffset: "+01:00",
  riskDrafts: [{ tradeNumber: 1, stopLoss: "52,857808", takeProfit: "52,22104" }],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.user.mockResolvedValue({ id: ownerId });
});

describe("Replay Server Actions", () => {
  it("leaves all Replay database methods idle while the feature is off", async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(getTradingViewReplayOptions()).resolves.toEqual({ status: "disabled" });
    await expect(createTradingViewReplaySession("Silber")).resolves.toEqual({ status: "disabled" });
    await expect(saveTradingViewReplay(input)).resolves.toEqual({ status: "disabled" });
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a verified user before reading or writing", async () => {
    mocks.user.mockResolvedValue(null);
    await expect(getTradingViewReplayOptions()).resolves.toEqual({ status: "sign_in" });
    await expect(createTradingViewReplaySession("Silber")).resolves.toEqual({ status: "sign_in" });
    await expect(saveTradingViewReplay(input)).resolves.toEqual({ status: "sign_in" });
    expect(mocks.sessions).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the signed-in owner for the session list and creation", async () => {
    const sessions = [{ id: sessionId, label: "Silber" }];
    mocks.sessions.mockResolvedValue(sessions);
    mocks.rpc.mockResolvedValue({ data: sessionId, error: null });
    await expect(getTradingViewReplayOptions()).resolves.toEqual({ status: "ready", sessions });
    await expect(createTradingViewReplaySession("  Silber  ")).resolves.toEqual({ status: "created", ...sessions[0] });
    expect(mocks.sessions).toHaveBeenCalledWith(ownerId);
    expect(mocks.rpc).toHaveBeenCalledWith("journal_create_replay_session_v1", { p_user_id: ownerId, p_label: "Silber" });
  });

  it("reconstructs the charge server-side and uses the authenticated owner and checked risk", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "imported", sessionId }, error: null });
    const withClientFields = { ...input, ownerId: "another-owner", mode: "live", netPnL: 0 };
    await expect(saveTradingViewReplay(withClientFields)).resolves.toEqual({ status: "imported", sessionId });
    expect(mocks.rpc).toHaveBeenCalledWith("journal_save_replay_import_v1", {
      p_user_id: ownerId,
      p_batch: expect.objectContaining({
        sessionId, mode: "simulation", pnlCurrency: "USD",
        trades: [expect.objectContaining({
          openedAt: "2026-11-11T13:15:00.000Z", closedAt: "2026-11-11T14:35:00.000Z",
          stopLoss: 52.857808, takeProfit: 52.22104, netPnL: 1157.76,
        })],
      }),
    });
  });

  it.each(["already_imported", "conflict"])("preserves the database result %s", async (status) => {
    mocks.rpc.mockResolvedValue({ data: { status, sessionId }, error: null });
    await expect(saveTradingViewReplay(input)).resolves.toEqual({ status, sessionId });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("reports a foreign or unavailable session without falling back to a write", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(saveTradingViewReplay(input)).resolves.toEqual({ status: "session_unavailable" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("treats an ambiguous commit as unconfirmed and retains the known session for a retry", async () => {
    mocks.rpc.mockRejectedValue(new Error("connection interrupted"));
    await expect(saveTradingViewReplay(input)).resolves.toEqual({ status: "unconfirmed" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects incomplete, invalid or oversized input before calling the writer", async () => {
    for (const changes of [
      { worksheetPayload: "" }, { worksheetPayload: "x".repeat(350_001) }, { exportOffset: "" },
      { riskDrafts: [{ tradeNumber: 1, stopLoss: "52", takeProfit: "" }] }, { sessionId: "bad session" },
      { worksheetPayload: encodeReplayWorksheet(worksheet.slice(0, 2))! },
    ]) {
      expect((await saveTradingViewReplay({ ...input, ...changes })).status).toBe("invalid");
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects the combined worksheet and risk fields when they exceed the request budget", async () => {
    const longCell = '"'.repeat(9500);
    const rows = [...worksheet, ...Array.from({ length: 16 }, () => [longCell])];
    const worksheetPayload = encodeReplayWorksheet(rows)!;
    expect(worksheetPayload).toBeTruthy();
    const riskDrafts = Array.from({ length: 2500 }, (_, index) => ({
      tradeNumber: index + 1, stopLoss: "1".repeat(63), takeProfit: "2".repeat(63),
    }));
    await expect(saveTradingViewReplay({ ...input, worksheetPayload, riskDrafts }))
      .resolves.toEqual({ status: "invalid", reason: "request-too-large" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("Replay worksheet transfer", () => {
  it("restores only the date column to a Date object", () => {
    expect(decodeReplayWorksheet(input.worksheetPayload)).toEqual(worksheet);
  });

  it("rejects malformed rows, invalid dates and payloads over the UTF-8 byte cap", () => {
    expect(decodeReplayWorksheet(JSON.stringify([header, [1, "Short-Einstieg", "2026-02-31T14:15:00.000Z"]]))).toBeNull();
    expect(decodeReplayWorksheet(JSON.stringify([header, [1, {}, null]]))).toBeNull();
    expect(decodeReplayWorksheet(JSON.stringify([header, ["€".repeat(130_000)]]))).toBeNull();
    expect(encodeReplayWorksheet([header, ["€".repeat(130_000)]])).toBeNull();
  });
});
